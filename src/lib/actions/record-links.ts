// ============================================================================
// RECORD LINK SERVER ACTIONS (manual, user-authored connections)
// ============================================================================
//
// Phase 5 of plans/2026-07-24-record-urls-and-reflection-refs.md. CRUD for the
// deliberate connections a user draws between two of their records, each with
// an optional free-text `note` explaining WHY they connect.
//
// Connections are stored as a single directed row but treated as UNDIRECTED:
// getRecordConnections looks at both columns, so a link shows on both records.
// The record_links_pair_uniq index (on the unordered pair) prevents duplicates
// in either direction; we also pre-check for a friendlier message.
//
// Everything is scoped to the current user. As with the other action modules,
// this file is "use server" — only async functions may be exported. Shared
// types (RecordConnection) live in validations/records.ts.
// ============================================================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, or, eq, inArray, desc } from "drizzle-orm";

import { db } from "@/db";
import { records, recordLinks } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { stripMarkdown } from "@/lib/strip-markdown";
import type { RecordConnection } from "@/lib/validations/records";

type ActionResult = {
  success: boolean;
  error?: string;
  linkId?: string;
};

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.userId;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

// ============================================================================
// ADD
// ============================================================================
// Links two of the user's records. Verifies ownership of BOTH, rejects
// self-links, and rejects a pair that's already connected (either direction).

export async function addRecordLink(input: {
  recordId: string;
  relatedRecordId: string;
  note?: string;
}): Promise<ActionResult> {
  const userId = await requireUserId();
  const { recordId, relatedRecordId } = input;
  const note = input.note?.trim() || null;

  if (!recordId || !relatedRecordId) {
    return { success: false, error: "Both records are required." };
  }
  if (recordId === relatedRecordId) {
    return { success: false, error: "A record can't be linked to itself." };
  }

  // Verify BOTH records exist and belong to this user.
  const owned = await db
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        eq(records.userId, userId),
        inArray(records.id, [recordId, relatedRecordId]),
      ),
    );
  if (owned.length !== 2) {
    return { success: false, error: "Record not found." };
  }

  // Friendly pre-check for an existing connection in either direction.
  const existing = await db
    .select({ id: recordLinks.id })
    .from(recordLinks)
    .where(
      and(
        eq(recordLinks.userId, userId),
        or(
          and(
            eq(recordLinks.recordId, recordId),
            eq(recordLinks.relatedRecordId, relatedRecordId),
          ),
          and(
            eq(recordLinks.recordId, relatedRecordId),
            eq(recordLinks.relatedRecordId, recordId),
          ),
        ),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return { success: false, error: "These records are already connected." };
  }

  try {
    const [row] = await db
      .insert(recordLinks)
      .values({ userId, recordId, relatedRecordId, note })
      .returning({ id: recordLinks.id });

    revalidatePath(`/records/${recordId}`);
    revalidatePath(`/records/${relatedRecordId}`);
    return { success: true, linkId: row.id };
  } catch (err) {
    // Backstop: the unordered-pair unique index caught a race the pre-check missed.
    if (isUniqueViolation(err)) {
      return { success: false, error: "These records are already connected." };
    }
    console.error("addRecordLink failed:", err);
    return { success: false, error: "Failed to add connection. Please try again." };
  }
}

// ============================================================================
// UPDATE NOTE
// ============================================================================
// Edit the "why" on an existing connection (the note is meant to be revisited).

export async function updateRecordLinkNote(
  linkId: string,
  note: string,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const result = await db
    .update(recordLinks)
    .set({ note: note.trim() || null })
    .where(and(eq(recordLinks.id, linkId), eq(recordLinks.userId, userId)))
    .returning({
      recordId: recordLinks.recordId,
      relatedRecordId: recordLinks.relatedRecordId,
    });

  if (result.length === 0) {
    return { success: false, error: "Connection not found." };
  }

  revalidatePath(`/records/${result[0].recordId}`);
  revalidatePath(`/records/${result[0].relatedRecordId}`);
  return { success: true };
}

// ============================================================================
// REMOVE
// ============================================================================

export async function removeRecordLink(linkId: string): Promise<ActionResult> {
  const userId = await requireUserId();

  const result = await db
    .delete(recordLinks)
    .where(and(eq(recordLinks.id, linkId), eq(recordLinks.userId, userId)))
    .returning({
      recordId: recordLinks.recordId,
      relatedRecordId: recordLinks.relatedRecordId,
    });

  if (result.length === 0) {
    return { success: false, error: "Connection not found." };
  }

  revalidatePath(`/records/${result[0].recordId}`);
  revalidatePath(`/records/${result[0].relatedRecordId}`);
  return { success: true };
}

// ============================================================================
// READ (undirected)
// ============================================================================
// Returns the connections for a record — resolving the "other" record on each
// link (this record may be on either side). deleteRecord clears links in both
// directions, so links never dangle.

export async function getRecordConnections(
  recordId: string,
): Promise<RecordConnection[]> {
  const userId = await requireUserId();

  const links = await db
    .select({
      linkId: recordLinks.id,
      note: recordLinks.note,
      recordId: recordLinks.recordId,
      relatedRecordId: recordLinks.relatedRecordId,
    })
    .from(recordLinks)
    .where(
      and(
        eq(recordLinks.userId, userId),
        or(
          eq(recordLinks.recordId, recordId),
          eq(recordLinks.relatedRecordId, recordId),
        ),
      ),
    )
    .orderBy(desc(recordLinks.createdAt));

  if (links.length === 0) return [];

  const otherIds = links.map((l) =>
    l.recordId === recordId ? l.relatedRecordId : l.recordId,
  );

  const others = await db
    .select({
      id: records.id,
      type: records.type,
      title: records.title,
      content: records.content,
      imagePath: records.imagePath,
      sourceAuthor: records.sourceAuthor,
    })
    .from(records)
    .where(and(eq(records.userId, userId), inArray(records.id, otherIds)));

  const byId = new Map(others.map((r) => [r.id, r]));

  return links.flatMap((l) => {
    const otherId = l.recordId === recordId ? l.relatedRecordId : l.recordId;
    const other = byId.get(otherId);
    if (!other) return [];
    return [
      {
        linkId: l.linkId,
        note: l.note,
        record: {
          id: other.id,
          type: other.type,
          title: other.title,
          preview: stripMarkdown(other.content).slice(0, 160).trim(),
          imagePath: other.imagePath,
          sourceAuthor: other.sourceAuthor,
        },
      },
    ];
  });
}
