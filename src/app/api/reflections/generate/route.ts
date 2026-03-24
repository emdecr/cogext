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
import { getSession } from "@/lib/auth/session";
import { generateWeeklyReflection } from "@/lib/ai/reflection";
import { aiGenerationLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { config } from "@/lib/config";

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
  const isCronCall =
    config.app.cronSecret && bearerToken === config.app.cronSecret;

  const session = await getSession();

  if (!session && !isCronCall) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limit authenticated users (cron calls bypass — they're already trusted).
  // 5 per day is more than enough; the job runs once a week.
  if (session && !isCronCall) {
    const rl = aiGenerationLimiter(session.userId);
    if (!rl.success) return rateLimitResponse(rl);
  }

  // Cron calls operate on all users; session calls operate on the current user.
  // For now, both paths generate for the session user (cron per-user is TODO).
  const userId = session?.userId;
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "No user context for generation" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

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
    console.error("Reflection generation error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate reflection" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
