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
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { tags, recordTags, records } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

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

export async function addTagToRecord(recordId: string, tagName: string) {
  const userId = await requireUserId();

  // Normalize the tag name: lowercase, trimmed, no extra spaces.
  // This prevents "Recipes", "recipes", and " recipes " from being
  // treated as different tags.
  const normalized = tagName.trim().toLowerCase();

  if (!normalized) {
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
    // Step 1: Find or create the tag.
    // We try to find it first. If it doesn't exist, we create it.
    let tag = await db.query.tags.findFirst({
      where: eq(tags.name, normalized),
    });

    if (!tag) {
      // Create the tag. .returning() gives us back the inserted row
      // so we don't need a separate SELECT query.
      const [newTag] = await db
        .insert(tags)
        .values({ name: normalized, isAi: false })
        .returning();
      tag = newTag;
    }

    // Step 2: Link the tag to the record.
    // onConflictDoNothing() prevents errors if the tag is already
    // linked to this record (the composite PK would otherwise throw
    // a unique constraint violation).
    await db
      .insert(recordTags)
      .values({ recordId, tagId: tag.id })
      .onConflictDoNothing();

    revalidatePath("/dashboard");

    return { success: true, tag };
  } catch (error) {
    console.error("Failed to add tag:", error);
    return { success: false, error: "Failed to add tag" };
  }
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
