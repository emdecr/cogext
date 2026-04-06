// ============================================================================
// REFLECTION GENERATION API ROUTE
// ============================================================================
//
// POST /api/reflections/generate
//
// Triggers weekly reflection generation for the authenticated user.
// This is an API route (not a server action) because it's designed to be
// called from external systems:
//   - A cron job (Phase 5) — e.g., every Sunday evening
//   - A manual trigger from the UI (a "Generate reflection" button)
//   - curl for testing: curl -X POST http://localhost:3000/api/reflections/generate
//
// Why not a server action?
//   Server actions are great for UI-driven mutations (form submissions,
//   button clicks). But this endpoint needs to be callable from outside
//   the Next.js app (cron jobs, webhooks), which requires a real HTTP
//   endpoint. API routes give us that.
//
// Idempotent: calling this multiple times in the same week returns the
// existing reflection — it won't generate duplicates.
// ============================================================================

import { NextRequest } from "next/server";
import { timingSafeEqual, createHash } from "crypto";
import { getSession } from "@/lib/auth/session";
import { generateWeeklyReflection, type ReflectionDateRange } from "@/lib/ai/reflection";
import { aiGenerationLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { db } from "@/db";

export async function POST(request: NextRequest) {
  // ---- Auth check ----
  // Two valid callers: the UI (session cookie) or a cron job (secret header).
  // Cron jobs can't carry session cookies, so we check for a shared secret.
  // The secret is set in CRON_SECRET env var — include it as a Bearer token:
  //   Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const isCronCall = verifyCronSecret(bearerToken);

  const session = await getSession();

  if (!session && !isCronCall) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- UI-triggered: generate for the logged-in user ----
  if (session && !isCronCall) {
    const rl = aiGenerationLimiter(session.userId);
    if (!rl.success) return rateLimitResponse(rl);

    return generateForUser(session.userId);
  }

  // ---- Parse optional date range (cron calls only) ----
  // Allows backfilling a missed week:
  //   curl -X POST .../generate -H "Authorization: Bearer ..." \
  //     -d '{"dateRange": {"start": "2026-03-30", "end": "2026-04-05"}}'
  let dateRange: ReflectionDateRange | undefined;
  try {
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
  } catch {
    // No body or non-JSON body — fine, proceed without a date range
  }

  // ---- Cron-triggered: generate for all users ----
  // Cron jobs don't carry a session, so we iterate over every user.
  // Each user's generation is independent — one failure doesn't block others.
  const allUsers = await db.query.users.findMany({
    columns: { id: true, email: true },
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
// GENERATE FOR A SINGLE USER
// ============================================================================
// Shared response builder for the UI-triggered (single-user) path.

async function generateForUser(userId: string) {
  try {
    const result = await generateWeeklyReflection(userId);

    if (!result) {
      // No records this week — nothing to reflect on
      return new Response(
        JSON.stringify({
          message: "No records saved this week — skipping reflection.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Reflection generated successfully.",
        reflectionId: result.id,
        // Include a preview so curl users can see what was generated
        preview: result.content.slice(0, 300),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    logger.error("Reflection generation failed", { userId, error });
    return new Response(
      JSON.stringify({ error: "Failed to generate reflection" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
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
