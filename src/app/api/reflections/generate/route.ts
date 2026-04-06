// ============================================================================
// REFLECTION GENERATION API ROUTE
// ============================================================================
//
// POST /api/reflections/generate
//
// Triggers weekly reflection generation for all users. Called exclusively
// by the cron job — not from the UI. Requires a Bearer token matching
// CRON_SECRET in the Authorization header.
//
// Accepts an optional JSON body for backfilling a missed week:
//   { "dateRange": { "start": "2026-03-30", "end": "2026-04-05" } }
// When omitted, defaults to the current Monday–Sunday boundaries.
//
// Idempotent: calling multiple times for the same period returns the
// existing reflection — it won't generate duplicates.
// ============================================================================

import { NextRequest } from "next/server";
import { timingSafeEqual, createHash } from "crypto";
import { generateWeeklyReflection, type ReflectionDateRange } from "@/lib/ai/reflection";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { db } from "@/db";

export async function POST(request: NextRequest) {
  // ---- Auth check ----
  // Only cron callers are valid. The secret is set in CRON_SECRET env var —
  // include it as a Bearer token:
  //   Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!verifyCronSecret(bearerToken)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- Parse optional date range ----
  // Allows backfilling a missed week:
  //   curl -X POST .../generate -H "Authorization: Bearer ..." \
  //     -d '{"dateRange": {"start": "2026-03-30", "end": "2026-04-05"}}'
  let dateRange: ReflectionDateRange | undefined;
  const body = await request.json().catch(() => ({}));
  if (body.dateRange) {
    const { start, end } = body.dateRange;
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) {
      return new Response(
        JSON.stringify({ error: "dateRange.start and dateRange.end must be valid YYYY-MM-DD dates with start <= end" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    dateRange = { start, end };
  }

  // ---- Generate for all users ----
  // Each user's generation is independent — one failure doesn't block others.
  const allUsers = await db.query.users.findMany({
    columns: { id: true },
  });

  const results: Array<{
    userId: string;
    status: "generated" | "skipped" | "error";
    reflectionId?: string;
    error?: string;
  }> = [];

  for (const user of allUsers) {
    try {
      const result = await generateWeeklyReflection(user.id, dateRange);

      if (result) {
        results.push({
          userId: user.id,
          status: "generated",
          reflectionId: result.id,
        });
      } else {
        results.push({
          userId: user.id,
          status: "skipped",
        });
      }
    } catch (error) {
      logger.error("Reflection generation failed for user", {
        userId: user.id,
        error,
      });
      results.push({
        userId: user.id,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const generated = results.filter((r) => r.status === "generated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  logger.info("Cron reflection generation complete", {
    total: allUsers.length,
    generated,
    skipped,
    errors,
  });

  return new Response(
    JSON.stringify({
      message: `Reflections complete: ${generated} generated, ${skipped} skipped, ${errors} errors.`,
      results,
    }),
    { status: errors > 0 ? 207 : 200, headers: { "Content-Type": "application/json" } }
  );
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

function verifyCronSecret(token: string | null): boolean {
  const secret = config.app.cronSecret;
  if (!secret || !token) return false;

  // Hash both values to normalize length for timingSafeEqual.
  // Even if the token and secret are different lengths, the hashes
  // are always 32 bytes, so the comparison doesn't leak length info.
  const secretHash = createHash("sha256").update(secret).digest();
  const tokenHash = createHash("sha256").update(token).digest();

  return timingSafeEqual(secretHash, tokenHash);
}
