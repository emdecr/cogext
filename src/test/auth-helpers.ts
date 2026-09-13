// ============================================================================
// AUTH TEST HELPERS
// ============================================================================
//
// Shared, side-effect-free fixtures for the JWT / proxy tests. Pure values and
// functions only — no process.env writes here, because jwt.ts reads JWT_SECRET
// at module load, so each test file that needs the env set must still do so in
// its own hoisted bootstrap (import order matters, and hoisted blocks can't see
// imported bindings). Those bootstraps use the same literal as TEST_JWT_SECRET
// and assert they match.

import { SignJWT } from "jose";

// A deterministic, >=32-char secret used across the auth tests.
export const TEST_JWT_SECRET = "test-jwt-secret-please-change-0123456789";

// The same secret as bytes — the form jose's verify/sign expects.
export const testSecretBytes = new TextEncoder().encode(TEST_JWT_SECRET);

/**
 * Sign a valid HS256 session token the way the app's tokens look
 * ({ userId }, 7-day expiry). Matches what the proxy verifies with jose and
 * what verifyToken (jsonwebtoken) accepts.
 */
export function signSession(userId = "user-1"): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(testSecretBytes);
}
