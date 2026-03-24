// =============================================================================
// LIVENESS CHECK — GET /api/health
// =============================================================================
//
// Answers: "Is the Next.js process running and able to respond?"
//
// This is the endpoint Docker uses in docker-compose.prod.yml:
//   healthcheck:
//     test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
//
// Rules for a liveness endpoint:
//   ✅ Must be FAST — Docker checks every 30s, a slow check wastes resources
//   ✅ Must return 200 if the process is alive (regardless of dependencies)
//   ❌ Must NOT check the database or other external services
//   ❌ Must NOT require authentication
//
// Why no DB check here?
//   If we checked the DB and it went temporarily offline, Docker would restart
//   the app container — which doesn't fix the DB and just adds noise.
//   The app container is alive; the DB is the problem. Liveness ≠ readiness.
//   Use GET /api/health/ready for a full dependency check.
//
// Response:
//   { "status": "ok", "uptime": 3600, "timestamp": "..." }
// =============================================================================

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      // Simple status string — easy to grep in logs and monitoring dashboards
      status: "ok",

      // process.uptime() returns seconds since the Node process started.
      // Useful for spotting recent restarts: if uptime is 30s, the container
      // just restarted and might still be warming up.
      uptime: Math.floor(process.uptime()),

      // ISO timestamp for when this response was generated.
      // Lets you verify the response is fresh (not cached).
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        // Never cache health check responses — you always want the live state.
        "Cache-Control": "no-store",
      },
    }
  );
}
