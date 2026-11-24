// ============================================================================
// TAG SERVER ACTIONS
// ============================================================================
//
// Tags have a "find or create" pattern:
//   - When a user types "recipes", we check if a tag named "recipes" exists
//   - If yes, use the existing tag
//   - If no, create a new one
//
// This means users don't have to manage a tag list separately — they just
// type whatever tag they want and the system handles deduplication.
//
// Tags are linked to records through the record_tags join table.
// Adding a tag = inserting a row in record_tags.
// Removing a tag = deleting a row from record_tags.
// The tag itself is never deleted (other records might use it).
// ============================================================================

"use server";

import { revalidatePath } from "next/cache";
import { eq, and, sql, desc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { tags, recordTags, records } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { tagRecord } from "@/lib/ai/tag-record";
import { logger } from "@/lib/logger";
import { linkTagByName, normalizeTagName } from "@/lib/tag-link";

// ---- Auth helper (same pattern as records.ts) ----
async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.userId;
}

// ============================================================================
// ADD TAG TO RECORD
// ============================================================================
// Takes a tag name (string) and a record ID.
// Finds or creates the tag, then links it to the record.
//
// Returns the tag object so the UI can immediately show it without
// waiting for a full page refresh.

export async function addTagToRecord(
  recordId: string,
  tagName: string,
  isAi: boolean = false,
  // Skip revalidation when called from background async contexts
  // (e.g., AI auto-tagging). Next.js only allows revalidatePath
  // during the original server action request — calling it from a
  // detached promise throws an error.
  skipRevalidate: boolean = false,
) {
  const userId = await requireUserId();

  // Normalize the tag name: lowercase, trimmed. This prevents "Recipes",
  // "recipes", and " recipes " from being treated as different tags.
  if (!normalizeTagName(tagName)) {
    return { success: false, error: "Tag name is required" };
  }

  // Verify the record belongs to this user
  const record = await db.query.records.findFirst({
    where: and(eq(records.id, recordId), eq(records.userId, userId)),
  });

  if (!record) {
    return { success: false, error: "Record not found" };
  }

  try {
    // Find or create the tag, then link it. Both steps are conflict-safe:
    // re-adding a tag the record already has is a no-op. See tag-link.ts.
    const tag = await linkTagByName(recordId, tagName, isAi);

    if (!skipRevalidate) {
      revalidatePath("/dashboard");
    }

    return { success: true, tag };
  } catch (error) {
    console.error("Failed to add tag:", error);
    return { success: false, error: "Failed to add tag" };
  }
}

// ============================================================================
// REGENERATE AI TAGS
// ============================================================================
// Re-runs auto-tagging for one record: the retry for when the background
// tagging in createRecord failed. Awaited (unlike createRecord's), so the UI
// can say what happened and revalidatePath is allowed. Adds to existing tags;
// never removes any. See src/lib/ai/tag-record.ts.

export type RegenerateTagsResult =
  | { success: true; tags: string[] }
  | { success: false; error: string };

export async function regenerateTags(
  recordId: string,
): Promise<RegenerateTagsResult> {
  const userId = await requireUserId();

  try {
    const record = await db.query.records.findFirst({
      where: and(eq(records.id, recordId), eq(records.userId, userId)),
      columns: { id: true },
    });
    if (!record) return { success: false, error: "Record not found" };

    const result = await tagRecord(recordId);
    switch (result.status) {
      case "tagged":
        revalidatePath("/dashboard");
        revalidatePath(`/records/${recordId}`);
        return { success: true, tags: result.tags };
      case "no_description":
        return {
          success: false,
          error: "Couldn't describe the image, so there's nothing to tag from. Try again later.",
        };
      case "no_tags":
        return {
          success: false,
          error: "The AI didn't return any tags. Try again later.",
        };
      case "not_found":
        return { success: false, error: "Record not found" };
    }
  } catch (error) {
    logger.error("Regenerate tags failed", { feature: "tagging", recordId, error });
    return { success: false, error: "Failed to generate tags" };
  }
}

// ============================================================================
// TAG SUGGESTIONS
// ============================================================================
// Returns the distinct tags applied to THIS user's records, most-used first.
// Powers the autocomplete in TagInput so you can reuse an existing tag (e.g. a
// book title) instead of retyping and risking a near-duplicate. Scoped to the
// user's own records even though tags are global — no reason to surface tag
// names the user has never used.

export async function getTagSuggestions(): Promise<
  { name: string; count: number }[]
> {
  const userId = await requireUserId();

  return db
    .select({
      name: tags.name,
      count: sql<number>`count(*)::int`,
    })
    .from(recordTags)
    .innerJoin(tags, eq(recordTags.tagId, tags.id))
    .innerJoin(records, eq(recordTags.recordId, records.id))
    .where(eq(records.userId, userId))
    .groupBy(tags.name)
    .orderBy(desc(sql`count(*)`));
}

// ============================================================================
// REMOVE TAG FROM RECORD
// ============================================================================
// Removes the link between a tag and a record (deletes the join table row).
// Does NOT delete the tag itself — other records might still use it.

export async function removeTagFromRecord(recordId: string, tagId: string) {
  const userId = await requireUserId();

  // Verify record ownership
  const record = await db.query.records.findFirst({
    where: and(eq(records.id, recordId), eq(records.userId, userId)),
  });

  if (!record) {
    return { success: false, error: "Record not found" };
  }

  try {
    await db
      .delete(recordTags)
      .where(
        and(eq(recordTags.recordId, recordId), eq(recordTags.tagId, tagId)),
      );

    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Failed to remove tag:", error);
    return { success: false, error: "Failed to remove tag" };
  }
}
