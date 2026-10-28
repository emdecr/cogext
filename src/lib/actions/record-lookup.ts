// ============================================================================
// RECORD LOOKUP SERVER ACTION
// ============================================================================
//
// Fast "find a record by name" for the editor's `[[` picker. Deliberately NOT
// searchRecords(): that embeds the query via Voyage on every call, which is too
// slow and costs money when it runs per keystroke. This is plain ILIKE over
// title / author / content, which is plenty at personal-corpus scale.
//
// Ranking: books first (the main use case is citing a book from a note), then
// title prefix matches, then title substring matches, then most recent.
// An empty query returns the most recent records so the picker isn't blank.
//
// See plans/2026-10-28-inline-record-links.md (Chunk 1).
// ============================================================================

"use server";

import { and, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { records } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { stripMarkdown } from "@/lib/strip-markdown";
import type { RecordLookupResult } from "@/lib/validations/records";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const LABEL_MAX = 80;

// Escape LIKE wildcards so a typed "%" or "_" matches literally.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Untitled records (most notes) fall back to the start of their content.
function labelFor(title: string | null, content: string): string {
  if (title?.trim()) return title.trim();
  const plain = stripMarkdown(content).replace(/\s+/g, " ").trim();
  if (!plain) return "Untitled";
  return plain.length > LABEL_MAX ? `${plain.slice(0, LABEL_MAX - 1)}…` : plain;
}

export async function lookupRecords(
  query: string,
  opts: { excludeId?: string; limit?: number } = {},
): Promise<RecordLookupResult[]> {
  const session = await getSession();
  if (!session) redirect("/login");

  const trimmed = query.trim().slice(0, 200);
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const conditions: SQL[] = [eq(records.userId, session.userId)];
  if (opts.excludeId) conditions.push(ne(records.id, opts.excludeId));

  const order: SQL[] = [sql`(${records.type} = 'book') desc`];

  if (trimmed) {
    const contains = `%${escapeLike(trimmed)}%`;
    const prefix = `${escapeLike(trimmed)}%`;
    conditions.push(
      or(
        ilike(records.title, contains),
        ilike(records.sourceAuthor, contains),
        ilike(records.content, contains),
      )!,
    );
    order.push(
      sql`(${records.title} ilike ${prefix}) desc`,
      sql`(${records.title} ilike ${contains}) desc`,
    );
  }

  const rows = await db
    .select({
      id: records.id,
      type: records.type,
      title: records.title,
      content: records.content,
      sourceAuthor: records.sourceAuthor,
      imagePath: records.imagePath,
    })
    .from(records)
    .where(and(...conditions))
    .orderBy(...order, desc(records.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    label: labelFor(r.title, r.content),
    sourceAuthor: r.sourceAuthor,
    imagePath: r.imagePath,
  }));
}
