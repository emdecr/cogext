// ============================================================================
// SESSION MANAGEMENT (Cookie Handling)
// ============================================================================
//
// This file manages the auth cookie — the bridge between the JWT we
// create and the browser that stores it.
//
// Why cookies (not localStorage)?
//   - Cookies are sent AUTOMATICALLY with every request. No client-side
//     code needed to attach them.
//   - HTTP-only cookies can't be accessed by JavaScript. This protects
//     against XSS attacks (if malicious JS gets injected into your page,
//     it can't steal the token from localStorage, but it CAN'T read
//     HTTP-only cookies).
//   - Cookies work with server-side rendering (SSR). localStorage is
//     only available in the browser, so server components can't read it.
//     Cookies are sent with the HTTP request, so the server has them.
//
// Cookie settings explained:
//   httpOnly: true   — JavaScript can't read it (XSS protection)
//   secure: true     — only sent over HTTPS (prevents interception)
//   sameSite: "lax"  — only sent for same-site requests + top-level
//                       navigations (CSRF protection). "strict" would
//                       break links from other sites to your app.
//   path: "/"        — cookie is available on all routes
//   maxAge: seconds  — when the cookie expires (browser deletes it)
// ============================================================================

import { cookies } from "next/headers";
import { createToken, verifyToken, type JwtPayload } from "./jwt";

// The name of the cookie in the browser. You'd see this in
// DevTools → Application → Cookies.
const COOKIE_NAME = "brain-session";

// 7 days in seconds. Must match the JWT expiry in jwt.ts.
// The cookie expiry and JWT expiry serve different purposes:
//   - Cookie maxAge: when the BROWSER deletes the cookie
//   - JWT exp: when the SERVER rejects the token
// We keep them in sync so the cookie doesn't outlive the token
// (which would cause confusing "logged out" experiences).
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Create a session for a user — generates a JWT and sets it as a cookie.
 * Call this after successful login or registration.
 *
 * @example
 *   await setSession(user.id);
 *   // Browser now has the auth cookie — user is "logged in"
 */
export async function setSession(userId: string): Promise<void> {
  const token = createToken({ userId });

  // next/headers cookies() is async in Next.js 15+.
  // It provides access to the request's cookies in server components,
  // server actions, and route handlers.
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",  // HTTPS only in prod
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Read the current session from the cookie.
 * Returns the JWT payload (with userId) if valid, or null if
 * there's no cookie or the token is invalid/expired.
 *
 * @example
 *   const session = await getSession();
 *   if (!session) redirect("/login");
 *   // session.userId is available
 */
export async function getSession(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);

  // No cookie = not logged in.
  if (!cookie?.value) return null;

  // Verify the JWT inside the cookie.
  // Returns null if expired, tampered with, or malformed.
  return verifyToken(cookie.value);
}

/**
 * Clear the session cookie — logs the user out.
 * The browser deletes the cookie, so subsequent requests
 * won't have a token, and middleware will redirect to login.
 *
 * @example
 *   await clearSession();
 *   redirect("/login");
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();

  // .delete() tells the browser to remove the cookie.
  // Under the hood, it sets the cookie with maxAge=0.
  cookieStore.delete(COOKIE_NAME);
}
