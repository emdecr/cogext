// ============================================================================
// JWT (JSON Web Tokens)
// ============================================================================
//
// A JWT is a signed, encoded string that contains data (a "payload").
// We use it to identify who's making a request without hitting the
// database on every single request.
//
// The flow:
//   1. User logs in → we create a JWT containing their user ID
//   2. We send the JWT to the browser (as a cookie)
//   3. Browser sends the cookie with every subsequent request
//   4. Our middleware reads the JWT, verifies the signature, extracts
//      the user ID → now we know who's making the request
//
// What a JWT looks like (three parts separated by dots):
//   eyJhbGciOiJI.eyJ1c2VySWQiOiJh.SflKxwRJSMeKKF2QT4
//   └── header    └── payload          └── signature
//
//   header:    { "alg": "HS256", "typ": "JWT" }  — metadata
//   payload:   { "userId": "abc-123", "exp": 1234567890 }  — our data
//   signature: HMAC-SHA256(header + payload, SECRET_KEY)  — tamper proof
//
// The signature is the security piece. It's created using a secret key
// that only our server knows. If anyone modifies the payload (e.g.,
// changes the userId), the signature won't match and we reject it.
//
// IMPORTANT: JWTs are ENCODED, not ENCRYPTED. Anyone can decode the
// payload — it's just base64. The signature only prevents TAMPERING,
// not READING. That's why we never put sensitive data (passwords, etc.)
// in the payload. The userId is fine — it's not secret, it's just an
// identifier.
// ============================================================================

import jwt from "jsonwebtoken";

// The secret key used to sign and verify tokens.
// This MUST be a long, random string in production.
// If someone gets this key, they can forge tokens for any user.
//
// We read it from an env var so it's never in the codebase.
// We'll add a JWT_SECRET to .env.local.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Add it to .env.local:\n" +
      'JWT_SECRET=some-long-random-string-change-me-in-production'
  );
}

// How long a token stays valid before the user has to log in again.
// "7d" = 7 days. After that, the token's `exp` claim will be in the
// past and verifyToken() will reject it.
//
// Shorter = more secure (less time for a stolen token to be useful).
// Longer = better UX (user doesn't have to re-login constantly).
// 7 days is a common balance for a personal app.
const TOKEN_EXPIRY = "7d";

// The shape of the data we store in the JWT payload.
// This is what we get back when we verify a token.
export interface JwtPayload {
  userId: string;
}

/**
 * Create a signed JWT containing the user's ID.
 * Call this after successful login or registration.
 *
 * @example
 *   const token = createToken({ userId: user.id });
 *   // Set this token as an HTTP-only cookie
 */
export function createToken(payload: JwtPayload): string {
  // jwt.sign() does three things:
  //   1. Creates the header (algorithm + type)
  //   2. Encodes the payload (our data + expiration time)
  //   3. Signs both with our secret key
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify a JWT and extract the payload.
 * Call this in middleware to identify the requesting user.
 *
 * Returns the payload if the token is valid, or null if:
 *   - The token has been tampered with (signature doesn't match)
 *   - The token has expired (past its `exp` time)
 *   - The token is malformed (not a real JWT)
 *
 * @example
 *   const payload = verifyToken(tokenFromCookie);
 *   if (!payload) redirect("/login");
 *   // payload.userId is now available
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    // jwt.verify() checks the signature AND the expiration.
    // If either check fails, it throws an error.
    const decoded = jwt.verify(token, JWT_SECRET!) as JwtPayload;
    return decoded;
  } catch {
    // Token is invalid, expired, or malformed.
    // We return null instead of throwing so callers can handle it
    // with a simple if-check instead of try/catch.
    return null;
  }
}
