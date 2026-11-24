// ============================================================================
// LINK A TAG TO A RECORD BY NAME
// ============================================================================
//
// The "find or create" core shared by addTagToRecord (user-facing server
// action) and tagRecord (AI tagging retries, including the admin bulk retag).
// No auth or ownership check here: callers do that, because the admin path
// tags records that belong to other users.
//
// Race-safe: several AI tags are linked in parallel, and two of them (or two
// records) can try to create the same tag at once. INSERT ... ON CONFLICT DO
// NOTHING on the unique name, then SELECT, never throws on that collision.
// ============================================================================

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recordTags, tags } from "@/db/schema";

/** Lowercased and trimmed, so "Recipes" and " recipes " are one tag. "" means invalid. */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

export async function linkTagByName(
  recordId: string,
  tagName: string,
  isAi: boolean,
) {
  const name = normalizeTagName(tagName);
  if (!name) return null;

  await db
    .insert(tags)
    .values({ name, isAi })
    .onConflictDoNothing({ target: tags.name });

  const tag = await db.query.tags.findFirst({ where: eq(tags.name, name) });
  if (!tag) throw new Error(`Tag "${name}" missing after insert`);

  await db
    .insert(recordTags)
    .values({ recordId, tagId: tag.id })
    .onConflictDoNothing();

  return tag;
}
