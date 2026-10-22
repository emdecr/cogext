// ============================================================================
// CRON SECRET AUTH
// ============================================================================
//
// Server-to-server endpoints called by host cron jobs (not browsers) send
//   Authorization: Bearer <CRON_SECRET>
// Used by POST /api/reflections/generate and GET /api/health/ai.
//
// API routes aren't behind the proxy's session redirect (src/proxy.ts skips
// /api), so every such route MUST call this before doing anything.
// ============================================================================

import { timingSafeEqual, createHash } from "crypto";
import type { NextRequest } from "next/server";
import { config } from "@/lib/config";

/** True when the request carries `Authorization: Bearer <CRON_SECRET>`. */
export function isCronAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  return verifyCronSecret(bearerToken);
}

// ============================================================================
// TIMING-SAFE SECRET VERIFICATION
// ============================================================================
// Uses crypto.timingSafeEqual to prevent timing attacks. A naive === comparison
// leaks information about how many characters matched — an attacker can probe
// the secret character-by-character by measuring response times.
//
// timingSafeEqual always compares the full length in constant time, regardless
// of where the strings differ. Both buffers must be the same length, so we
// compare SHA-256 hashes (always 32 bytes) instead of raw strings.

export function verifyCronSecret(token: string | null): boolean {
  const secret = config.app.cronSecret;
  if (!secret || !token) return false;

  // Hash both values to normalize length for timingSafeEqual.
  // Even if the token and secret are different lengths, the hashes
  // are always 32 bytes, so the comparison doesn't leak length info.
  const secretHash = createHash("sha256").update(secret).digest();
  const tokenHash = createHash("sha256").update(token).digest();

  return timingSafeEqual(secretHash, tokenHash);
}
