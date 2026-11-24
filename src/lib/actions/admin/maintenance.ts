"use server";

// ============================================================================
// ADMIN — MAINTENANCE ACTIONS
// ============================================================================
//
// Fixes for the problems the Data tab reports. Admin-only: requireAdmin()
// 404s anyone else. Instance-wide, like the Data tab: it touches every
// user's records.
//
// retagUntaggedRecords() re-runs AI tagging on records with no tags, a batch
// per call so a click returns in reasonable time (each record is one LLM
// call, plus image analysis for image records still on the placeholder).
// Records that fail stay untagged; the client passes their ids back in
// `skipIds` so the next batch moves past them instead of retrying them first.
// ============================================================================

import { revalidatePath } from "next/cache";
import { count, desc, eq, notExists, notInArray, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { records, recordTags } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import { tagRecord } from "@/lib/ai/tag-record";
import { logger } from "@/lib/logger";

const RETAG_BATCH_SIZE = 10;

// Client-supplied; bound it so a crafted call can't send an enormous list.
const skipIdsSchema = z.array(z.uuid()).max(1000);

export type RetagResult =
  | {
      success: true;
      tagged: number;
      // Ids attempted this batch that are still untagged.
      failedIds: string[];
      // Untagged records left, including failed ones.
      remaining: number;
    }
  | { success: false; error: string };

const hasNoTags = notExists(
  db.select().from(recordTags).where(eq(recordTags.recordId, records.id)),
);

export async function retagUntaggedRecords(
  skipIds: string[] = [],
): Promise<RetagResult> {
  await requireAdmin();

  const parsed = skipIdsSchema.safeParse(skipIds);
  if (!parsed.success) return { success: false, error: "Invalid request" };

  try {
    const batch = await db
      .select({ id: records.id })
      .from(records)
      .where(
        parsed.data.length > 0
          ? and(hasNoTags, notInArray(records.id, parsed.data))
          : hasNoTags,
      )
      .orderBy(desc(records.createdAt))
      .limit(RETAG_BATCH_SIZE);

    // Sequential on purpose: keeps provider load (and rate limits) gentle.
    let tagged = 0;
    const failedIds: string[] = [];
    for (const { id } of batch) {
      try {
        const result = await tagRecord(id);
        if (result.status === "tagged") tagged++;
        else failedIds.push(id);
      } catch (error) {
        logger.error("Bulk retag failed for record", { feature: "tagging", recordId: id, error });
        failedIds.push(id);
      }
    }

    const [{ n: remaining }] = await db
      .select({ n: count() })
      .from(records)
      .where(hasNoTags);

    revalidatePath("/admin/data");
    return { success: true, tagged, failedIds, remaining };
  } catch (error) {
    logger.error("Bulk retag failed", { feature: "tagging", error });
    return { success: false, error: "Retag failed. Check the server logs." };
  }
}
