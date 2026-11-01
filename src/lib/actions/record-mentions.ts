// ============================================================================
// RECORD MENTIONS SERVER ACTIONS (inline-ref backlinks and outgoing refs)
// ============================================================================
//
// Derived from inline record refs (`[Label](/records/<id> "type")`) in
// content or note, both directions:
//   - getRecordMentions: the user's other records that ref this one
//     ("Mentions this")
//   - getOutgoingMentions: the records this one refs ("Mentioned here")
// Nothing is stored — a regex scan is fine at personal-corpus scale. If
// it ever isn't, extract refs on save into a `record_mentions` table.
//
// Deliberately separate from record_links: inserting a ref in prose does NOT
// create a connection. Connections stay deliberate (they carry a "why" note).
//
// See plans/2026-10-28-inline-record-links.md ("Mentioned in" backlinks).
// ============================================================================

"use server";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { records } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { extractRecordRefIds, recordRefPgRegex } from "@/lib/record-ref";
import { stripMarkdown } from "@/lib/strip-markdown";
import type { RelatedRecord } from "@/lib/validations/records";

const MENTIONS_LIMIT = 24;

const mentionColumns = {
  id: records.id,
  type: records.type,
  title: records.title,
  content: records.content,
  imagePath: records.imagePath,
  sourceAuthor: records.sourceAuthor,
};

function toRelatedRecord(r: {
  id: string;
  type: string;
  title: string | null;
  content: string;
  imagePath: string | null;
  sourceAuthor: string | null;
}): RelatedRecord {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    preview: stripMarkdown(r.content).slice(0, 160).trim(),
    imagePath: r.imagePath,
    sourceAuthor: r.sourceAuthor,
  };
}

export async function getRecordMentions(
  recordId: string,
): Promise<RelatedRecord[]> {
  const session = await getSession();
  if (!session) redirect("/login");

  // The id goes into a regex — only accept a real uuid.
  if (!z.uuid().safeParse(recordId).success) return [];

  const pattern = recordRefPgRegex(recordId);

  const rows = await db
    .select(mentionColumns)
    .from(records)
    .where(
      and(
        eq(records.userId, session.userId),
        ne(records.id, recordId),
        sql`(${records.content} ~* ${pattern} or ${records.note} ~* ${pattern})`,
      ),
    )
    .orderBy(desc(records.updatedAt))
    .limit(MENTIONS_LIMIT);

  return rows.map(toRelatedRecord);
}

// Records this one refs in its own content/note, in order of appearance.
// Scoped to the user, so refs to deleted (or foreign) ids simply drop out.
export async function getOutgoingMentions(
  recordId: string,
): Promise<RelatedRecord[]> {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!z.uuid().safeParse(recordId).success) return [];

  const source = await db.query.records.findFirst({
    where: and(eq(records.id, recordId), eq(records.userId, session.userId)),
    columns: { content: true, note: true },
  });
  if (!source) return [];

  const ids = [
    ...new Set([
      ...extractRecordRefIds(source.content),
      ...extractRecordRefIds(source.note),
    ]),
  ]
    .filter((id) => id !== recordId.toLowerCase())
    .slice(0, MENTIONS_LIMIT);
  if (ids.length === 0) return [];

  const rows = await db
    .select(mentionColumns)
    .from(records)
    .where(and(eq(records.userId, session.userId), inArray(records.id, ids)));

  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [toRelatedRecord(r)] : [];
  });
}
