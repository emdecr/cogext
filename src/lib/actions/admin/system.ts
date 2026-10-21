"use server";

// ============================================================================
// ADMIN — SYSTEM OVERVIEW (read-only)
// ============================================================================
//
// Everything on the admin System tab in one call: dependency readiness (the
// same checks as /api/health/ready, run in-process), runtime and build info,
// which AI model runs which feature, and storage config. Names only — never
// keys or secrets. Admin-only: requireAdmin() 404s anyone else.
// ============================================================================

import { desc } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { runReadinessChecks, type ReadinessReport } from "@/lib/health";
import { getModelAssignments, type ModelAssignment } from "@/lib/ai";

export type LastUsed = { model: string; at: string };

export type SystemOverview = {
  readiness: ReadinessReport;
  runtime: {
    nodeVersion: string;
    nodeEnv: string;
    uptimeSeconds: number;
    gitSha: string;
    gitRepository: string;
  };
  models: (ModelAssignment & { lastUsed: LastUsed | null })[];
  // False when the ai_usage lookup failed — the table then shows "unknown"
  // rather than claiming "never used".
  lastUsedAvailable: boolean;
  storage: { provider: string; bucket: string | null };
  generatedAt: string;
};

// Latest ai_usage row per feature (all users). DISTINCT ON keeps the first
// row of each feature group under the ORDER BY, i.e. the newest. Never throws.
async function getLastUsedByFeature(): Promise<Map<string, LastUsed> | null> {
  try {
    const rows = await db
      .selectDistinctOn([aiUsage.feature], {
        feature: aiUsage.feature,
        model: aiUsage.model,
        createdAt: aiUsage.createdAt,
      })
      .from(aiUsage)
      .orderBy(aiUsage.feature, desc(aiUsage.createdAt));
    return new Map(
      rows.map((r) => [
        r.feature,
        { model: r.model, at: r.createdAt.toISOString() },
      ])
    );
  } catch (error) {
    logger.warn("Admin system: ai_usage last-used lookup failed", { error });
    return null;
  }
}

export async function getSystemOverview(): Promise<SystemOverview> {
  await requireAdmin();

  const [readiness, lastUsed] = await Promise.all([
    runReadinessChecks(),
    getLastUsedByFeature(),
  ]);

  return {
    readiness,
    runtime: {
      nodeVersion: process.version,
      nodeEnv: config.app.nodeEnv,
      uptimeSeconds: Math.floor(process.uptime()),
      gitSha: config.app.gitSha,
      gitRepository: config.app.gitRepository,
    },
    models: getModelAssignments().map((m) => ({
      ...m,
      lastUsed: lastUsed?.get(m.feature) ?? null,
    })),
    lastUsedAvailable: lastUsed !== null,
    storage: {
      provider: config.storage.provider,
      bucket: config.storage.provider === "minio" ? config.storage.bucket : null,
    },
    generatedAt: new Date().toISOString(),
  };
}
