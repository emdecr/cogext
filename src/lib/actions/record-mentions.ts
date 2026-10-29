// ============================================================================
// RECORD MENTIONS SERVER ACTION ("Mentioned in" backlinks)
// ============================================================================
//
// Derived backlinks: the user's other records whose content or note contains
// an inline record ref (`[Label](/records/<id> "type")`) pointing at this
// record. Nothing is stored — a LIKE scan is fine at personal-corpus scale. If
// it ever isn't, extract refs on save into a `record_mentions` table.
//
// Deliberately separate from record_links: inserting a ref in prose does NOT
// create a connection. Connections stay deliberate (they carry a "why" note).
//
// See plans/2026-10-28-inline-record-links.md ("Mentioned in" backlinks).
// ============================================================================

"use server";

import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { records } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { recordRefLikePattern } from "@/lib/record-ref";
import { stripMarkdown } from "@/lib/strip-markdown";
import type { RelatedRecord } from "@/lib/validations/records";

const MENTIONS_LIMIT = 24;

export async function getRecordMentions(
  recordId: string,
): Promise<RelatedRecord[]> {
  const session = await getSession();
  if (!session) redirect("/login");

  // The id goes into a LIKE pattern — only accept a real uuid.
  if (!z.uuid().safeParse(recordId).success) return [];

  const pattern = recordRefLikePattern(recordId);

  const rows = await db
    .select({
      id: records.id,
      type: records.type,
      title: records.title,
      content: records.content,
      imagePath: records.imagePath,
      sourceAuthor: records.sourceAuthor,
    })
    .from(records)
    .where(
      and(
        eq(records.userId, session.userId),
        ne(records.id, recordId),
        or(ilike(records.content, pattern), ilike(records.note, pattern)),
      ),
    )
    .orderBy(desc(records.updatedAt))
    .limit(MENTIONS_LIMIT);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    preview: stripMarkdown(r.content).slice(0, 160).trim(),
    imagePath: r.imagePath,
    sourceAuthor: r.sourceAuthor,
  }));
}
