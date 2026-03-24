// =============================================================================
// RATE LIMITING — in-memory, fixed window
// =============================================================================
//
// Provides per-route rate limiters to protect against:
//   - Brute force login attempts
//   - Account creation spam
//   - Expensive AI API calls (Claude costs money per request)
//   - File storage abuse
//
// Algorithm: Fixed Window
//   Time is divided into equal-sized buckets (the "window").
//   Each identifier (IP or user ID) gets N requests per window.
//   When the window rolls over, the counter resets.
//
//   Example: limit=10, window=60s
//     Request at :05 → count=1, remaining=9  ✅
//     Request at :55 → count=9, remaining=1  ✅
//     Request at :59 → count=10, remaining=0 ✅ (last allowed)
//     Request at :60 → count=11 → BLOCKED 429
//     Request at 1:00 → count=1, remaining=9 ✅ (new window)
//
//   Known tradeoff: a client can burst 2× the limit across a window
//   boundary (10 at :59 + 10 at 1:00). For a personal tool this is fine.
//   For high-security endpoints, use a sliding window algorithm instead.
//
// Storage: in-memory Map
//   Counters live in Node process memory — fast, zero dependencies.
//   Tradeoffs vs Redis:
//     ✅ No extra service to run
//     ✅ Microsecond lookups
//     ❌ Resets on container restart (minor — just means limits reset too)
//     ❌ Doesn't sync across multiple instances (not relevant: single VPS)
//
// Usage:
//   import { chatLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit"
//
//   const ip = getClientIp(request)
//   const result = chatLimiter(ip)
//   if (!result.success) return rateLimitResponse(result)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

// =============================================================================
// TYPES
// =============================================================================

// State stored per identifier (IP or user ID) per window.
type WindowEntry = {
  count: number;       // requests made in this window
  windowStart: number; // ms timestamp when this window started
};

// What a rate limit check returns.
export type RateLimitResult = {
  success: boolean;   // true = request is allowed
  limit: number;      // maximum requests allowed per window
  remaining: number;  // requests left in this window (0 if blocked)
  reset: number;      // Unix timestamp (seconds) when the window resets
};

// A rate limit checker function: takes an identifier, returns a result.
export type RateLimiter = (identifier: string) => RateLimitResult;

// =============================================================================
// FACTORY
// =============================================================================
// Creates a rate limiter with the given constraints.
// Returns a function you call on each request with the identifier to check.
//
// Each createRateLimiter() call creates its own isolated store — so
// the login limiter and the chat limiter have completely separate counters.

export function createRateLimiter(options: {
  limit: number;  // max requests allowed per window
  window: number; // window size in SECONDS
}): RateLimiter {
  const windowMs = options.window * 1000;

  // The store: maps each identifier to its current window state.
  // Map is O(1) for get/set — fast enough for thousands of identifiers.
  const store = new Map<string, WindowEntry>();

  // Periodic cleanup: if the store grows large (many unique IPs hitting
  // the server), sweep out entries from expired windows. This prevents
  // unbounded memory growth in the unlikely case of a DDoS.
  // We run the cleanup lazily — only when a new request comes in and
  // the store is large. This avoids the overhead of a setInterval.
  function maybeCleanup() {
    if (store.size < 500) return;

    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      // Entry is stale if its window has already passed.
      if (now - entry.windowStart > windowMs * 2) {
        store.delete(key);
      }
    }
  }

  return function check(identifier: string): RateLimitResult {
    maybeCleanup();

    const now = Date.now();

    // Calculate which fixed window we're currently in.
    // Math.floor(now / windowMs) * windowMs snaps to the window start.
    // Example with windowMs=60000 (1 minute):
    //   now = 65000ms → windowStart = 60000ms
    //   now = 119000ms → windowStart = 60000ms (same window)
    //   now = 120000ms → windowStart = 120000ms (new window)
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowEnd = windowStart + windowMs;
    const reset = Math.floor(windowEnd / 1000); // Unix seconds

    const entry = store.get(identifier);

    // Case 1: No entry, or entry is from a previous window → fresh start.
    if (!entry || entry.windowStart !== windowStart) {
      store.set(identifier, { count: 1, windowStart });
      return {
        success: true,
        limit: options.limit,
        remaining: options.limit - 1,
        reset,
      };
    }

    // Case 2: Entry exists in the current window → increment.
    entry.count++;
    const remaining = Math.max(0, options.limit - entry.count);

    return {
      success: entry.count <= options.limit,
      limit: options.limit,
      remaining,
      reset,
    };
  };
}

// =============================================================================
// PRE-CONFIGURED LIMITERS
// =============================================================================
// Module-level singletons — created once, reused across all requests.
// Each has its own store so limits are independent per route.

// Auth: protect against brute force and spam
// Using short windows and low limits because these are high-value targets.
export const loginLimiter = createRateLimiter({
  limit: 10,          // 10 attempts...
  window: 15 * 60,    // ...per 15 minutes per IP
});

export const registerLimiter = createRateLimiter({
  limit: 5,           // 5 registrations...
  window: 60 * 60,    // ...per hour per IP
});

// AI routes: protect against expensive Claude API calls.
// These are generous limits — a real user won't hit them in normal usage.
// They're primarily there to cap runaway usage or scripted abuse.
export const chatLimiter = createRateLimiter({
  limit: 30,          // 30 chat messages...
  window: 60 * 60,    // ...per hour per user
});

export const aiGenerationLimiter = createRateLimiter({
  limit: 5,           // 5 generation calls (reflection/profile)...
  window: 24 * 60 * 60, // ...per day per user
});

// Upload: protect against storage abuse.
export const uploadLimiter = createRateLimiter({
  limit: 20,          // 20 uploads...
  window: 10 * 60,    // ...per 10 minutes per user
});

// =============================================================================
// CLIENT IP HELPER
// =============================================================================
// Extracts the real client IP address from a request, accounting for
// proxies (Nginx, Cloudflare) that add forwarding headers.
//
// Header priority (most → least trusted):
//   CF-Connecting-IP    — Cloudflare's header (only valid if using Cloudflare)
//   X-Real-IP           — set by Nginx with `proxy_set_header X-Real-IP $remote_addr`
//   X-Forwarded-For     — standard proxy header, comma-separated chain of IPs
//                         We take the FIRST IP (original client), not the last.
//   fallback: "unknown" — won't match any legitimate identifier, effectively
//                         rate-limits all unknown-IP requests as one client.
//
// Security note: X-Forwarded-For can be spoofed by clients if your Nginx
// config doesn't strip or override it. Make sure Nginx sets:
//   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
// This appends the real IP, so even if the client sent a fake one, the
// real IP is at the end of the chain. But for simplicity, we use X-Real-IP
// first (which Nginx sets from $remote_addr — not spoofable).

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// =============================================================================
// RATE LIMIT RESPONSE HELPER
// =============================================================================
// Returns a standardized 429 Too Many Requests response with the
// rate limit headers that well-behaved clients use to back off gracefully.
//
// Standard headers (used by APIs like GitHub, Stripe, etc.):
//   X-RateLimit-Limit:     total requests allowed per window
//   X-RateLimit-Remaining: requests left in this window
//   X-RateLimit-Reset:     Unix timestamp when the window resets
//   Retry-After:           seconds until the client can retry (RFC 6585)

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const now = Math.floor(Date.now() / 1000);
  const retryAfter = Math.max(0, result.reset - now);

  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.reset.toString(),
        "Retry-After": retryAfter.toString(),
      },
    }
  );
}
