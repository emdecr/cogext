// =============================================================================
// READINESS CHECK — GET /api/health/ready
// =============================================================================
//
// Answers: "Are all dependencies healthy and the app ready to serve traffic?"
//
// Checks:
//   database — SELECT 1 against Postgres. Critical: 503 if down.
//   storage  — MinIO health endpoint (only when STORAGE_PROVIDER=minio).
//              Degraded (200) if down — reading still works, uploads fail.
//
// HTTP Status:
//   200 — all checks passed, or only non-critical checks failed (degraded)
//   503 — database is unreachable (app cannot function without data)
//
// Use cases:
//   - Post-deploy smoke test: curl https://yourdomain.com/api/health/ready
//   - Uptime monitor (Better Uptime, UptimeRobot, etc.) alerting
//   - Debugging: which dependency is having trouble?
//   - CI/CD gate: wait for readiness before marking a deploy successful
//
// Response shape:
//   {
//     "status": "ok" | "degraded" | "error",
//     "timestamp": "...",
//     "checks": {
//       "database": { "status": "ok", "latencyMs": 5 },
//       "storage":  { "status": "ok" }
//     }
//   }
//
// Does NOT require authentication — needs to be callable by external
// monitors that don't have a user session.
// =============================================================================

import { NextResponse } from "next/server";
import { runReadinessChecks } from "@/lib/health";

// The checks themselves live in src/lib/health.ts (shared with the admin
// System tab).

export async function GET() {
  const report = await runReadinessChecks();

  // HTTP 503 only for critical failures (DB down).
  // Degraded → 200 so monitoring tools don't page you for non-critical
  // issues at 3am. Set up a separate alert for "degraded" if you want.
  const httpStatus = report.status === "error" ? 503 : 200;

  return NextResponse.json(report, {
    status: httpStatus,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
