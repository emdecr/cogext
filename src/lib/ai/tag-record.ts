// ============================================================================
// TAG A SAVED RECORD (retry path)
// ============================================================================
//
// createRecord auto-tags once, in the background. If that call fails (the
// provider errors, or image analysis returns nothing), the record is left with
// no tags and nothing retries. tagRecord() is the on-demand retry, used by:
//   - regenerateTags()        — the "Generate tags" button on a record
//   - retagUntaggedRecords()  — the admin Data tab's bulk retag
//
// It mirrors createRecord's AI step, working from what's stored:
//   - Image records still holding the upload placeholder ("Image" or empty)
//     get analysed first. Tagging a placeholder makes the LLM invent tags, so
//     if analysis fails again we stop there. A new description also gets
//     re-embedded, since the stored embedding describes the placeholder.
//   - Everything else is tagged from its current content.
// New AI tags are added alongside existing ones; nothing is removed.
//
// No ownership check: callers do that. Awaited, not fire-and-forget, so it
// never calls revalidatePath itself; the calling server action does.
// ============================================================================

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { records } from "@/db/schema";
import { getLLMProvider } from "@/lib/ai";
import { analyzeImage } from "@/lib/ai/analyze-image";
import { embedRecord } from "@/lib/ai/embed-record";
import { logAiOutcome } from "@/lib/ai/usage";
import { logger } from "@/lib/logger";
import { linkTagByName, normalizeTagName } from "@/lib/tag-link";

export type TagRecordResult =
  | { status: "tagged"; tags: string[] }
  // The LLM returned no tags. generateTags never throws; failures land here
  // and are logged to ai_usage via logAiOutcome.
  | { status: "no_tags" }
  // Image record whose analysis failed, so there was nothing to tag from.
  | { status: "no_description" }
  | { status: "not_found" };

/** The content createRecord saves for an image before analysis fills it in. */
const IMAGE_PLACEHOLDER = "image";

/**
 * True when an image record still has no real description: its content is
 * empty or the "Image" placeholder. A description the user typed counts as
 * real and is tagged as-is.
 */
export function needsImageAnalysis(record: {
  type: string;
  imagePath: string | null;
  content: string;
}): boolean {
  if (record.type !== "image" || !record.imagePath) return false;
  const content = record.content.trim().toLowerCase();
  return content === "" || content === IMAGE_PLACEHOLDER;
}

export async function tagRecord(recordId: string): Promise<TagRecordResult> {
  const record = await db.query.records.findFirst({
    where: eq(records.id, recordId),
    columns: { id: true, userId: true, type: true, content: true, imagePath: true },
  });
  if (!record) return { status: "not_found" };

  let content = record.content;

  if (needsImageAnalysis(record)) {
    const description = await analyzeImage(record.imagePath!, record.userId);
    if (!description) return { status: "no_description" };

    await db
      .update(records)
      .set({ content: description, updatedAt: new Date() })
      .where(eq(records.id, record.id));
    content = description;

    // Same reason createRecord sequences these: embedRecord re-reads the row,
    // so it now sees the description. A failed embed shouldn't block tagging.
    await embedRecord(record.id).catch((err) =>
      logger.error("Re-embed after image analysis failed", {
        feature: "embedding",
        recordId: record.id,
        error: err,
      }),
    );
  }

  const llm = await getLLMProvider();
  const names = await llm.generateTags(content, record.type, (outcome) =>
    logAiOutcome({ userId: record.userId, feature: "tagging" }, outcome),
  );
  // Normalize and dedupe first, so "Pasta" and "pasta" link once.
  const unique = [...new Set(names.map(normalizeTagName).filter(Boolean))];
  if (unique.length === 0) return { status: "no_tags" };

  await Promise.all(unique.map((name) => linkTagByName(record.id, name, true)));
  return { status: "tagged", tags: unique };
}
