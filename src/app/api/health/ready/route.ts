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
//   ollama   — Ollama /api/tags endpoint. Degraded (200) if down —
//              existing records still load, just no new embeddings/AI tags.
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
//       "storage":  { "status": "ok" },
//       "ollama":   { "status": "degraded", "note": "..." }
//     }
//   }
//
// Does NOT require authentication — needs to be callable by external
// monitors that don't have a user session.
// =============================================================================

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

// =============================================================================
// CHECK RESULT TYPE
// =============================================================================

type CheckStatus = "ok" | "degraded" | "error";

type CheckResult = {
  status: CheckStatus;
  latencyMs?: number; // how long the check took (useful for DB latency monitoring)
  note?: string;      // human-readable detail on degraded/error
};

// =============================================================================
// INDIVIDUAL CHECKS
// =============================================================================

// ---------------------------------------------------------------------------
// Database check
// ---------------------------------------------------------------------------
// Runs `SELECT 1` — the lightest possible query that still exercises the full
// connection path (TCP connect, auth handshake, query, response).
// We measure round-trip latency — if it's >200ms for a SELECT 1, something
// is wrong with the connection (network issues, connection pool exhausted).

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    // sql`SELECT 1` is Drizzle's tagged template for raw SQL.
    // It goes through the same connection pool as all other queries,
    // so if this works, normal queries will too.
    await db.execute(sql`SELECT 1`);

    return {
      status: "ok",
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    logger.error("Health check: database unreachable", { error });
    return {
      status: "error",
      latencyMs: Date.now() - start,
      note: "Cannot connect to PostgreSQL",
    };
  }
}

// ---------------------------------------------------------------------------
// Storage check (MinIO)
// ---------------------------------------------------------------------------
// Only runs when STORAGE_PROVIDER=minio. In dev (local storage), we skip
// this check since there's no MinIO container to ping.
//
// MinIO provides a dedicated health endpoint: /minio/health/live
// It returns 200 if MinIO is up and ready, non-200 otherwise.
// This is the same endpoint our docker-compose.prod.yml healthcheck uses.

async function checkStorage(): Promise<CheckResult> {
  // Skip check in local storage mode — no MinIO to ping
  if (config.storage.provider !== "minio") {
    return {
      status: "ok",
      note: "Local storage (no MinIO check needed)",
    };
  }

  const start = Date.now();
  try {
    // Ping MinIO's built-in liveness endpoint.
    // Uses the internal endpoint (http://minio:9000) — same as the app uses
    // for uploads. If this is reachable, uploads will work.
    const response = await fetch(
      `${config.storage.endpoint}/minio/health/live`,
      {
        // Short timeout — health checks should fail fast, not hang.
        // If MinIO doesn't respond in 5s, it's down.
        signal: AbortSignal.timeout(5000),
      }
    );

    if (response.ok) {
      return { status: "ok", latencyMs: Date.now() - start };
    }

    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      note: `MinIO responded with HTTP ${response.status}`,
    };
  } catch (error) {
    logger.warn("Health check: MinIO unreachable", { error });
    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      // Degraded, not error — existing image URLs still load (they're cached
      // in the browser or served from the stored URLs). Only NEW uploads fail.
      note: "MinIO unreachable — uploads unavailable",
    };
  }
}

// ---------------------------------------------------------------------------
// Ollama check
// ---------------------------------------------------------------------------
// Calls Ollama's /api/tags endpoint which lists available models.
// Returns 200 with a JSON body if Ollama is up.
//
// Why /api/tags instead of just a ping?
//   It confirms Ollama is not just running but actually serving the API.
//   We could check for specific models too (nomic-embed-text, llama3.2:1b)
//   but that's overkill — if Ollama is up, models are either available or
//   will be pulled on next use.

async function checkOllama(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${config.ai.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return { status: "ok", latencyMs: Date.now() - start };
    }

    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      note: `Ollama responded with HTTP ${response.status}`,
    };
  } catch (error) {
    logger.warn("Health check: Ollama unreachable", { error });
    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      // Degraded: existing records load fine. Semantic search falls back
      // to keyword-only. No new embeddings or auto-tags until Ollama recovers.
      note: "Ollama unreachable — AI features degraded",
    };
  }
}

// =============================================================================
// READINESS HANDLER
// =============================================================================

export async function GET() {
  // Run all checks in parallel — faster than sequential.
  // If DB takes 50ms and Ollama takes 200ms, parallel = 200ms total,
  // sequential = 250ms. For a health endpoint called every N seconds, this adds up.
  const [database, storage, ollama] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkOllama(),
  ]);

  const checks = { database, storage, ollama };

  // Determine overall status.
  // Rules:
  //   "error"    — DB is down (critical, app can't serve data)
  //   "degraded" — non-critical service is down (app still partially works)
  //   "ok"       — everything healthy
  let overallStatus: CheckStatus = "ok";

  if (database.status === "error") {
    // DB failure is always critical — nothing works without data.
    overallStatus = "error";
  } else if (
    storage.status === "degraded" ||
    storage.status === "error" ||
    ollama.status === "degraded" ||
    ollama.status === "error"
  ) {
    overallStatus = "degraded";
  }

  // HTTP 503 only for critical failures (DB down).
  // Degraded → 200 so monitoring tools don't page you for Ollama hiccups
  // at 3am. You can set up a separate alert for "degraded" if you want.
  const httpStatus = overallStatus === "error" ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      checks,
    },
    {
      status: httpStatus,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
