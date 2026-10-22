// =============================================================================
// AI HEALTH CHECK — GET /api/health/ai
// =============================================================================
//
// Answers: "Did any AI call fail in the last AI_ALERT_WINDOW_HOURS?"
// Called every 6 hours by scripts/ai-health-check.sh (host cron), which turns
// the answer into a healthchecks.io ping — an email when it flips to "alert".
// See plans/2026-10-21-ai-failure-alerts.md, Phase 5.
//
// Same data and rule as the admin System tab's "AI call health" card
// (getAiHealthData + evaluateAiHealth), so the email and the page agree.
// Refusals and our own "aborted" cancellations never alert.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` — 401 otherwise. API routes
// aren't behind the proxy's session redirect, so this check is the gate.
//
// Responses:
//   200 { status: "ok" | "alert", errorCount, reasons, windowHours, ... }
//       — the check ran; the SCRIPT decides which ping to send
//   401 — missing/wrong secret
//   500 { status: "error" } — the check itself failed (script pings /fail)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { isCronAuthorized } from "@/lib/auth/cron-secret";
import { getAiHealthData } from "@/lib/ai-health-data";
import { evaluateAiHealth, NON_ALERTING_ERROR_KINDS } from "@/lib/ai-health";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  try {
    const now = new Date();
    const data = await getAiHealthData({ now, windowHours: config.aiAlerts.windowHours });
    const verdict = evaluateAiHealth(data.rows, { minErrors: config.aiAlerts.minErrors });

    // The window's alerting errors, for the ping body (healthchecks.io shows
    // it in the alert email). Messages are already capped at 300 chars and
    // are provider error text, never prompt or record content.
    const errors = data.recentErrors
      .filter(
        (e) => e.at >= data.windowStart && !NON_ALERTING_ERROR_KINDS.has(e.errorKind ?? "")
      )
      .map((e) => ({
        at: e.at,
        feature: e.feature,
        kind: e.errorKind,
        model: e.model,
        message: e.errorMessage,
      }));

    return NextResponse.json(
      {
        status: verdict.status,
        errorCount: verdict.errorCount,
        reasons: verdict.reasons,
        windowHours: data.windowHours,
        windowStart: data.windowStart,
        checkedAt: now.toISOString(),
        latestErrors: errors,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    logger.error("AI health check failed", { error });
    return NextResponse.json(
      { status: "error", error: "AI health check failed" },
      { status: 500, headers: NO_STORE }
    );
  }
}
