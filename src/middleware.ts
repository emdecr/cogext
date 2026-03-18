// ============================================================================
// MIDDLEWARE
// ============================================================================
//
// Next.js middleware runs BEFORE every request — before your page or API
// route code executes. It sits between the browser and your app:
//
//   Browser → Middleware → Page/API Route
//
// We use it for ONE job: checking if the user is authenticated.
//   - If they're visiting a protected page and have no valid session →
//     redirect to /login
//   - If they're visiting login/register and already have a session →
//     redirect to /dashboard (no need to log in again)
//   - Everything else → let it through
//
// IMPORTANT: This file MUST be at `src/middleware.ts` (not inside app/).
// Next.js looks for it at the project root or src root specifically.
//
// IMPORTANT: Middleware runs on the Edge Runtime, which is a lightweight
// environment (not full Node.js). Some Node.js APIs aren't available.
// That's why we use jose instead of jsonwebtoken here — jose is
// Edge-compatible. We'll handle this below.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// The cookie name — must match what session.ts uses.
const COOKIE_NAME = "brain-session";

// Routes that require authentication.
// If the user visits any of these without a valid session, they're
// redirected to /login.
const PROTECTED_ROUTES = ["/dashboard"];

// Routes that are for unauthenticated users only.
// If a logged-in user visits these, redirect them to /dashboard
// (they don't need to see the login page again).
const AUTH_ROUTES = ["/login", "/register"];

// jose needs the secret as a Uint8Array, not a plain string.
// TextEncoder converts our string to bytes.
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

/**
 * Verify the session cookie using jose (Edge-compatible JWT library).
 * Returns the payload if valid, null if not.
 */
async function verifySession(
  request: NextRequest
): Promise<{ userId: string } | null> {
  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return null;

  try {
    // jwtVerify from jose — works the same as jsonwebtoken.verify()
    // but runs in the Edge Runtime.
    const { payload } = await jwtVerify(cookie.value, getJwtSecret());
    return payload as { userId: string };
  } catch {
    // Token expired, tampered with, or malformed.
    return null;
  }
}

// ============================================================================
// THE MIDDLEWARE FUNCTION
// ============================================================================
// Next.js calls this for every request that matches the `config.matcher`
// pattern below. We check the session and redirect accordingly.

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request);

  // ---- Protected routes: redirect to login if no session ----
  const isProtectedRoute = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isProtectedRoute && !session) {
    // Build the redirect URL. We preserve the original URL as a
    // "redirect" query param so after login we can send them back
    // to where they were trying to go.
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ---- Auth routes: redirect to dashboard if already logged in ----
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);

  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ---- Everything else: let it through ----
  return NextResponse.next();
}

// ============================================================================
// MATCHER CONFIG
// ============================================================================
// This tells Next.js WHICH requests should run through the middleware.
// Without this, middleware would run on EVERY request (including static
// files like images, CSS, JS bundles), which is wasteful.
//
// The pattern below excludes:
//   - _next/ (Next.js internal files: JS bundles, HMR, etc.)
//   - Static files (images, fonts, favicon)
//   - API routes (they handle their own auth if needed)

export const config = {
  matcher: [
    // Match all paths EXCEPT static files and Next.js internals.
    // This regex says: match any path that does NOT start with
    // _next, api, or contain a file extension (like .png, .css).
    "/((?!_next|api|.*\\..*).*)",
  ],
};
