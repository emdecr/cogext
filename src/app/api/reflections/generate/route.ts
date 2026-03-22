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

export async function POST(request: NextRequest) {
  // ---- Auth check ----
  // For now, we use session auth (same as the chat route).
  // In Phase 5, you might add a secret-based auth for cron jobs:
  //   if (request.headers.get("x-cron-secret") === process.env.CRON_SECRET)
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await generateWeeklyReflection(session.userId);

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
