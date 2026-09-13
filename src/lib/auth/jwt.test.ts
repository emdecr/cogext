// @vitest-environment node
// ============================================================================
// JWT — UNIT TESTS
// ============================================================================
//
// Two things are under test here:
//
//  1. The ordinary contract of createToken/verifyToken: a valid token round-
//     trips, and tampered / wrong-secret / expired / malformed tokens are all
//     rejected as null (never throw).
//
//  2. The cross-library seam. This app signs tokens with `jsonwebtoken` (Node
//     runtime, src/lib/auth/jwt.ts) but the proxy verifies them with `jose`
//     (Edge runtime, src/proxy.ts). Nothing else guards that these two agree.
//     If they ever diverged — a different default algorithm, a different secret
//     encoding — every logged-in user would be silently bounced by the proxy
//     and no other test would notice. These tests lock the agreement in both
//     directions.
//
// JWT_SECRET must be present BEFORE jwt.ts is imported (it throws at module load
// otherwise), so we set it in a hoisted block that runs before the imports.

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  // jwt.ts reads JWT_SECRET at module load, so it must be set before the import
  // below. Hoisted blocks can't see imported bindings, so the literal lives
  // here and is asserted equal to the shared TEST_JWT_SECRET just below.
  process.env.JWT_SECRET = "test-jwt-secret-please-change-0123456789";
});

import { createToken, verifyToken } from "@/lib/auth/jwt";
import jwt from "jsonwebtoken";
import { jwtVerify } from "jose";
import { TEST_JWT_SECRET, testSecretBytes, signSession } from "@/test/auth-helpers";

// Guard against the hoisted bootstrap drifting from the shared secret.
if (process.env.JWT_SECRET !== TEST_JWT_SECRET) {
  throw new Error("jwt.test bootstrap secret does not match TEST_JWT_SECRET");
}

describe("createToken / verifyToken", () => {
  it("round-trips a payload", () => {
    const token = createToken({ userId: "user-123" });
    expect(verifyToken(token)?.userId).toBe("user-123");
  });

  it("rejects a tampered signature", () => {
    const [h, p, s] = createToken({ userId: "user-123" }).split(".");
    const flipped = s.slice(0, -1) + (s.at(-1) === "A" ? "B" : "A");
    expect(verifyToken(`${h}.${p}.${flipped}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const foreign = jwt.sign({ userId: "user-123" }, "a-totally-different-secret-abcdefghij", {
      expiresIn: "7d",
    });
    expect(verifyToken(foreign)).toBeNull();
  });

  it("rejects an expired token", () => {
    // Signed with the SAME secret, so rejection is due to expiry, not signature.
    const expired = jwt.sign({ userId: "user-123" }, TEST_JWT_SECRET, { expiresIn: -10 });
    expect(verifyToken(expired)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "not-a-jwt", "a.b.c"]) {
      expect(verifyToken(bad)).toBeNull();
    }
  });
});

describe("jsonwebtoken <-> jose seam (login signs, proxy verifies)", () => {
  it("a jsonwebtoken-signed token verifies with jose (the production path)", async () => {
    const token = createToken({ userId: "user-abc" });
    const { payload } = await jwtVerify(token, testSecretBytes);
    expect(payload.userId).toBe("user-abc");
  });

  it("a jose-signed HS256 token verifies with jsonwebtoken (reverse direction)", async () => {
    const token = await signSession("user-xyz");
    expect(verifyToken(token)?.userId).toBe("user-xyz");
  });

  it("jose rejects a token signed with a different secret", async () => {
    const foreign = jwt.sign({ userId: "user-abc" }, "a-totally-different-secret-abcdefghij", {
      expiresIn: "7d",
    });
    await expect(jwtVerify(foreign, testSecretBytes)).rejects.toThrow();
  });
});
