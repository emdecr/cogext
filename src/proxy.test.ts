// @vitest-environment node
// ============================================================================
// PROXY (auth middleware) — UNIT TESTS
// ============================================================================
//
// The proxy is the gate in front of every non-static, non-API route. Its
// allow/deny logic is security-relevant and easy to get subtly wrong, yet
// nothing exercised it. These tests drive the real proxy() with real
// NextRequest objects and real jose-signed cookies, covering every branch:
//
//   Unauthenticated:
//     - protected path            → redirect to /nothing-to-see-here
//     - /login, /nothing-to-see-here → pass through (public)
//     - /register                 → public ONLY when ALLOW_REGISTRATION=true
//     - tampered/invalid cookie   → treated as unauthenticated
//   Authenticated:
//     - /login, /register         → bounce to /dashboard
//     - any other path            → pass through
//
// Session cookies are verified inside the proxy with jose, and getJwtSecret /
// ALLOW_REGISTRATION are read at request time, so we set them per test rather
// than at module load.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "@/proxy";
import { TEST_JWT_SECRET, signSession } from "@/test/auth-helpers";

const COOKIE_NAME = "cogext-session";

beforeAll(() => {
  // proxy reads JWT_SECRET at request time, so setting it here is enough.
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

afterEach(() => {
  // ALLOW_REGISTRATION is opt-in per test; never leak it across tests.
  delete process.env.ALLOW_REGISTRATION;
});

function request(pathname: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", `${COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL(`http://localhost${pathname}`), { headers });
}

// A response is a redirect if it carries a Location header; "next()" (pass
// through) carries none.
function redirectLocation(res: Response): string | null {
  return res.headers.get("location");
}

describe("proxy — unauthenticated", () => {
  it("redirects a protected path to /nothing-to-see-here", async () => {
    const res = await proxy(request("/dashboard"));
    expect(redirectLocation(res)).toMatch(/\/nothing-to-see-here$/);
  });

  it("lets /login through", async () => {
    const res = await proxy(request("/login"));
    expect(redirectLocation(res)).toBeNull();
  });

  it("lets /nothing-to-see-here through (or the redirect would loop)", async () => {
    const res = await proxy(request("/nothing-to-see-here"));
    expect(redirectLocation(res)).toBeNull();
  });

  it("lets /register through only when ALLOW_REGISTRATION=true", async () => {
    process.env.ALLOW_REGISTRATION = "true";
    const open = await proxy(request("/register"));
    expect(redirectLocation(open)).toBeNull();
  });

  it("redirects /register when registration is closed", async () => {
    // ALLOW_REGISTRATION unset (afterEach cleared it).
    const res = await proxy(request("/register"));
    expect(redirectLocation(res)).toMatch(/\/nothing-to-see-here$/);
  });

  it("treats a tampered cookie as unauthenticated", async () => {
    const token = await signSession();
    const tampered = token.slice(0, -1) + (token.at(-1) === "A" ? "B" : "A");
    const res = await proxy(request("/dashboard", tampered));
    expect(redirectLocation(res)).toMatch(/\/nothing-to-see-here$/);
  });
});

describe("proxy — authenticated", () => {
  it("lets a protected path through with a valid session", async () => {
    const res = await proxy(request("/dashboard", await signSession()));
    expect(redirectLocation(res)).toBeNull();
  });

  it("bounces an authenticated user off /login to /dashboard", async () => {
    const res = await proxy(request("/login", await signSession()));
    expect(redirectLocation(res)).toMatch(/\/dashboard$/);
  });

  it("bounces an authenticated user off /register to /dashboard", async () => {
    const res = await proxy(request("/register", await signSession()));
    expect(redirectLocation(res)).toMatch(/\/dashboard$/);
  });
});
