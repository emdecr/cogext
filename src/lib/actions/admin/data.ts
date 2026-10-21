"use server";

// ============================================================================
// ADMIN — DATA OVERVIEW (read-only)
// ============================================================================
//
// Counts and health signals for the admin Data tab: records by type, the
// other content tables, records missing an embedding or tags, which models
// produced the stored embeddings, and when reflections / the AI profile last
// ran. Totals cover ALL users (this is an instance-level view). Admin-only:
// requireAdmin() 404s anyone else.
//
// All cheap aggregates on a personal-scale DB. The untagged check uses
// NOT EXISTS against record_tags, whose (record_id, tag_id) primary key
// serves the lookup.
// ============================================================================

import { count, desc, isNotNull, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiProfile,
  collections,
  conversations,
  messages,
  recordLinks,
  records,
  reflections,
  tags,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { modelFor } from "@/lib/ai/model-settings";
import {
  classifyEmbeddingModels,
  deriveDataWarnings,
  type DataWarning,
  type EmbeddingModelStatus,
} from "@/lib/data-health";

export type RecordRef = {
  id: string;
  type: string;
  title: string | null;
  createdAt: string;
};

export type DataOverview = {
  records: {
    total: number;
    byType: { type: string; count: number }[];
    missingEmbedding: number;
    untagged: number;
    lastSavedAt: string | null;
  };
  embeddingModels: EmbeddingModelStatus[];
  currentEmbedModel: string;
  // Newest few problem records, to click through and fix.
  recentMissingEmbedding: RecordRef[];
  recentUntagged: RecordRef[];
  totals: {
    tags: number;
    collections: number;
    conversations: number;
    messages: number;
    reflections: number;
    links: number;
  };
  lastReflectionAt: string | null;
  lastProfileUpdateAt: string | null;
  warnings: DataWarning[];
  generatedAt: string;
};

const RECENT_PROBLEM_LIMIT = 5;

// Correlated "this record has no tags" predicate, reused by count and list.
const hasNoTags = sql`not exists (select 1 from record_tags rt where rt.record_id = ${records.id})`;

const recordRefColumns = {
  id: records.id,
  type: records.type,
  title: records.title,
  createdAt: records.createdAt,
};

const toRef = (r: { id: string; type: string; title: string | null; createdAt: Date }): RecordRef => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
});

export async function getDataOverview(): Promise<DataOverview> {
  await requireAdmin();

  const currentEmbedModel = modelFor("EMBED_MODEL");

  const [
    byType,
    [health],
    modelRows,
    missingList,
    untaggedList,
    [tagCount],
    [collectionCount],
    [conversationCount],
    [messageCount],
    [reflectionStats],
    [linkCount],
    [profileStats],
  ] = await Promise.all([
    db
      .select({ type: records.type, count: count() })
      .from(records)
      .groupBy(records.type)
      .orderBy(desc(count())),
    db
      .select({
        missingEmbedding: sql<number>`count(*) filter (where ${records.embedding} is null)`.mapWith(Number),
        untagged: sql<number>`count(*) filter (where ${hasNoTags})`.mapWith(Number),
        lastSavedAt: max(records.createdAt),
      })
      .from(records),
    db
      .select({ model: records.embeddingModel, count: count() })
      .from(records)
      .where(isNotNull(records.embedding))
      .groupBy(records.embeddingModel),
    db
      .select(recordRefColumns)
      .from(records)
      .where(isNull(records.embedding))
      .orderBy(desc(records.createdAt))
      .limit(RECENT_PROBLEM_LIMIT),
    db
      .select(recordRefColumns)
      .from(records)
      .where(hasNoTags)
      .orderBy(desc(records.createdAt))
      .limit(RECENT_PROBLEM_LIMIT),
    db.select({ n: count() }).from(tags),
    db.select({ n: count() }).from(collections),
    db.select({ n: count() }).from(conversations),
    db.select({ n: count() }).from(messages),
    db.select({ n: count(), last: max(reflections.createdAt) }).from(reflections),
    db.select({ n: count() }).from(recordLinks),
    db.select({ last: max(aiProfile.updatedAt) }).from(aiProfile),
  ]);

  const total = byType.reduce((sum, r) => sum + r.count, 0);
  const embeddingModels = classifyEmbeddingModels(modelRows, currentEmbedModel);
  const staleEmbedding = embeddingModels
    .filter((m) => m.status === "stale")
    .reduce((sum, m) => sum + m.count, 0);

  return {
    records: {
      total,
      byType,
      missingEmbedding: health.missingEmbedding,
      untagged: health.untagged,
      lastSavedAt: health.lastSavedAt?.toISOString() ?? null,
    },
    embeddingModels,
    currentEmbedModel,
    recentMissingEmbedding: missingList.map(toRef),
    recentUntagged: untaggedList.map(toRef),
    totals: {
      tags: tagCount.n,
      collections: collectionCount.n,
      conversations: conversationCount.n,
      messages: messageCount.n,
      reflections: reflectionStats.n,
      links: linkCount.n,
    },
    lastReflectionAt: reflectionStats.last?.toISOString() ?? null,
    lastProfileUpdateAt: profileStats.last?.toISOString() ?? null,
    warnings: deriveDataWarnings({
      missingEmbedding: health.missingEmbedding,
      untagged: health.untagged,
      staleEmbedding,
      currentModel: currentEmbedModel,
    }),
    generatedAt: new Date().toISOString(),
  };
}
