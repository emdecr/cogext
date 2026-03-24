// ============================================================================
// PROFILE API ROUTE
// ============================================================================
//
// POST /api/profile — Triggers AI profile generation for the current user.
// GET  /api/profile — Returns the current profile (if one exists).
//
// Profile generation is intentionally triggered (not automatic) because:
//   1. It calls the Claude API (costs money per call)
//   2. It's not urgent — the profile enhances conversations but isn't required
//   3. The user should have control over when it runs
//
// In Phase 5, we'll add a cron job that regenerates profiles periodically
// (e.g., weekly) for users with significant new content. For now, it's
// triggered manually via the sidebar or after the first conversation.
// ============================================================================

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { generateProfile, getProfile } from "@/lib/ai/profile";
import { aiGenerationLimiter, rateLimitResponse } from "@/lib/rate-limit";

// ============================================================================
// GET — Retrieve the current profile
// ============================================================================

export async function GET() {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const profile = await getProfile(session.userId);

    if (!profile) {
      return new Response(
        JSON.stringify({ profile: null, message: "No profile generated yet" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch profile" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ============================================================================
// POST — Generate (or regenerate) the profile
// ============================================================================

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limit — profile generation calls Claude. Shared limiter with
  // reflections (aiGenerationLimiter) since both are expensive AI calls.
  const rl = aiGenerationLimiter(session.userId);
  if (!rl.success) return rateLimitResponse(rl);

  try {
    const profile = await generateProfile(session.userId);

    return new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Profile generation failed:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate profile" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
