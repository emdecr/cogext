// =============================================================================
// READINESS CHECKS (shared)
// =============================================================================
//
// The dependency checks behind GET /api/health/ready, extracted so the admin
// System tab can run the SAME checks in-process instead of fetching our own
// HTTP route. The route keeps its HTTP contract (200 ok/degraded, 503 error) —
// the deploy smoke check and external monitors depend on it.
// =============================================================================

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

// =============================================================================
// CHECK RESULT TYPE
// =============================================================================

export type CheckStatus = "ok" | "degraded" | "error";

export type CheckResult = {
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

export async function checkDatabase(): Promise<CheckResult> {
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

export async function checkStorage(): Promise<CheckResult> {
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


// =============================================================================
// OVERALL STATUS
// =============================================================================
// Rules:
//   "error"    — DB is down (critical, app can't serve data)
//   "degraded" — non-critical service is down (app still partially works)
//   "ok"       — everything healthy

export type ReadinessChecks = { database: CheckResult; storage: CheckResult };

export function deriveOverallStatus(checks: ReadinessChecks): CheckStatus {
  if (checks.database.status === "error") return "error";
  if (checks.storage.status === "degraded" || checks.storage.status === "error") {
    return "degraded";
  }
  return "ok";
}

export type ReadinessReport = {
  status: CheckStatus;
  timestamp: string;
  uptime: number; // seconds since the Node process started
  checks: ReadinessChecks;
};

/** Run all checks in parallel and summarize. Never throws. */
export async function runReadinessChecks(): Promise<ReadinessReport> {
  const [database, storage] = await Promise.all([
    checkDatabase(),
    checkStorage(),
  ]);
  const checks = { database, storage };
  return {
    status: deriveOverallStatus(checks),
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    checks,
  };
}
