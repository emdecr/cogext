// ============================================================================
// UNIT TESTS — Rate Limiter
// ============================================================================
//
// The rate limiter is a pure function factory — createRateLimiter() returns
// a check function that updates an in-memory store. No network, no DB.
// This makes it easy to test deeply.
//
// KEY TECHNIQUE: fake timers
//   The rate limiter is time-dependent (window expiry). Real tests can't
//   sleep for 15 minutes waiting for a window to reset. Instead we use
//   Vitest's fake timer APIs to manipulate time:
//
//     vi.useFakeTimers()   — take control of Date.now() and setTimeout
//     vi.setSystemTime(n)  — jump to a specific timestamp
//     vi.useRealTimers()   — restore real timers (important: do this in afterEach!)
//
//   This pattern is common in any time-dependent code: expiry, retries,
//   debouncing, session timeouts.
// ============================================================================

import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

// ============================================================================
// createRateLimiter
// ============================================================================

describe("createRateLimiter", () => {
  // Activate fake timers before each test so Date.now() is under our control.
  // This prevents tests from interfering with each other — each test starts
  // with a clean, predictable time.
  beforeEach(() => {
    vi.useFakeTimers();
    // Start all tests at a fixed timestamp: 2024-01-01 00:00:00 UTC
    // Using a real date makes test output easier to reason about
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    // IMPORTANT: always restore real timers. If you forget, the next test
    // file that runs will also get fake timers — a subtle, hard-to-debug bug.
    vi.useRealTimers();
  });

  it("allows the first request", () => {
    const limiter = createRateLimiter({ limit: 5, window: 60 });

    const result = limiter("user-1");

    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4); // 5 limit - 1 used = 4 remaining
  });

  it("allows requests up to the limit", () => {
    const limiter = createRateLimiter({ limit: 3, window: 60 });

    limiter("user-1"); // request 1
    limiter("user-1"); // request 2
    const result = limiter("user-1"); // request 3 — right at the limit

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks the request that exceeds the limit", () => {
    const limiter = createRateLimiter({ limit: 3, window: 60 });

    limiter("user-1"); // 1
    limiter("user-1"); // 2
    limiter("user-1"); // 3 — at limit
    const result = limiter("user-1"); // 4 — OVER limit

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0); // remaining never goes below 0
  });

  it("tracks different identifiers independently", () => {
    // user-1 and user-2 have completely separate counters.
    // user-1 hitting the limit should NOT affect user-2.
    const limiter = createRateLimiter({ limit: 2, window: 60 });

    limiter("user-1");
    limiter("user-1");
    limiter("user-1"); // user-1 is now blocked

    const result = limiter("user-2"); // user-2 is unaffected

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("resets the count when the window expires", () => {
    const limiter = createRateLimiter({ limit: 2, window: 60 }); // 60-second window

    // Use up the limit in the first window
    limiter("user-1");
    limiter("user-1");
    expect(limiter("user-1").success).toBe(false); // blocked

    // Advance time by 61 seconds — into the next window
    vi.advanceTimersByTime(61 * 1000);

    // Now the request should succeed again
    const result = limiter("user-1");
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1); // fresh window: 2 limit - 1 used = 1
  });

  it("includes the correct reset timestamp", () => {
    // We start at 2024-01-01T00:00:00Z (Unix: 1704067200s)
    // With a 60s window, the window runs from :00 to :60
    // reset should be the end of that window: 1704067260s
    const limiter = createRateLimiter({ limit: 5, window: 60 });

    const result = limiter("user-1");

    // The reset time should be within the current window
    // (current time + some seconds, not in the past)
    const now = Math.floor(Date.now() / 1000);
    expect(result.reset).toBeGreaterThan(now);
    expect(result.reset).toBeLessThanOrEqual(now + 60);
  });
});

// ============================================================================
// getClientIp
// ============================================================================

describe("getClientIp", () => {
  // Helper to create a minimal NextRequest mock with specific headers.
  // We only need the .headers.get() method — the full NextRequest is complex.
  function makeRequest(headers: Record<string, string>): NextRequest {
    return {
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
    } as unknown as NextRequest;
  }

  it("returns the Cloudflare IP when CF-Connecting-IP is present", () => {
    const req = makeRequest({ "cf-connecting-ip": "1.2.3.4" });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP when CF header is absent", () => {
    const req = makeRequest({ "x-real-ip": "5.6.7.8" });
    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  it("falls back to the first IP in X-Forwarded-For", () => {
    // X-Forwarded-For can be a comma-separated chain: client, proxy1, proxy2
    // We want the leftmost (original client) IP
    const req = makeRequest({
      "x-forwarded-for": "9.10.11.12, 192.168.1.1, 10.0.0.1",
    });
    expect(getClientIp(req)).toBe("9.10.11.12");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    // This effectively rate-limits all unknown-IP requests as one client.
    // Better than crashing or skipping the check.
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("unknown");
  });

  it("prefers CF-Connecting-IP over X-Real-IP when both are present", () => {
    // Priority order: CF → X-Real-IP → X-Forwarded-For
    const req = makeRequest({
      "cf-connecting-ip": "1.2.3.4",
      "x-real-ip": "5.6.7.8",
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
});
