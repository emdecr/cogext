// ============================================================================
// PROXY (route middleware)
// ============================================================================
//
// Next.js 16 renamed the "middleware" file convention to "proxy" (same Edge
// runtime, same NextRequest/NextResponse API, same config.matcher). This file
// runs BEFORE every matched request — before your page or API route code
// executes. It sits between the browser and your app:
//
//   Browser → Proxy → Page/API Route
//
// We use it to enforce a strict auth surface:
//   - Unauthenticated: /login is the only real page (plus /register while
//     registration is temporarily enabled). Every other path redirects to
//     /nothing-to-see-here — never to /login — so the app's surface isn't
//     advertised.
//   - Authenticated: /login and /register redirect to /dashboard; everything
//     else is allowed through.
//
// IMPORTANT: This file MUST be at `src/proxy.ts` (not inside app/).
// Next.js looks for it at the project root or src root specifically.
//
// IMPORTANT: The proxy runs on the Edge Runtime, which is a lightweight
// environment (not full Node.js). Some Node.js APIs aren't available.
// That's why we use jose instead of jsonwebtoken here — jose is
// Edge-compatible. We'll handle this below.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// The cookie name — must match what session.ts uses.
const COOKIE_NAME = "cogext-session";

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
// THE PROXY FUNCTION
// ============================================================================
// Next.js calls this for every request that matches the `config.matcher`
// pattern below. We check the session and redirect accordingly.

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request);

  // ---- Unauthenticated: /login is the only real page ----
  // Deliberately NO redirect to /login from other paths — we don't advertise
  // that the app (or a login page) exists. Every non-public path is sent to the
  // playful dead-end /nothing-to-see-here instead. /register is public only
  // while ALLOW_REGISTRATION is on, so a new account can still be created;
  // otherwise it's redirected like everything else. /nothing-to-see-here itself
  // must be public, or the redirect would loop. (Read process.env directly —
  // the proxy runs on the Edge runtime and can't import the Node config.)
  if (!session) {
    const registrationOpen = process.env.ALLOW_REGISTRATION === "true";
    const publicPath =
      pathname === "/login" ||
      pathname === "/nothing-to-see-here" ||
      (registrationOpen && pathname === "/register");
    if (publicPath) return NextResponse.next();
    return NextResponse.redirect(
      new URL("/nothing-to-see-here", request.url)
    );
  }

  // ---- Authenticated: keep them off the auth pages ----
  if (pathname === "/login" || pathname === "/register") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ---- Everything else: let it through ----
  return NextResponse.next();
}

// ============================================================================
// MATCHER CONFIG
// ============================================================================
// This tells Next.js WHICH requests should run through the proxy.
// Without this, the proxy would run on EVERY request (including static
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
