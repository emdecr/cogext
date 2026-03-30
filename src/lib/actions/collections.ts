// ============================================================================
// COLLECTION SERVER ACTIONS
// ============================================================================
//
// CRUD operations for collections — user-curated groups of records.
// Collections are like playlists: a record can belong to multiple collections,
// and a collection can contain many records (many-to-many via collection_records).
//
// Each action validates input with Zod and scopes queries by userId
// so users can only manage their own collections.
//
// Actions:
//   - getCollections()                          → list with record counts
//   - getCollection(id)                         → single collection + its records
//   - createCollection(formData)                → create new
//   - renameCollection(id, name)                → update name
//   - updateCollectionDescription(id, desc)     → update description
//   - updateCollectionCover(id, imagePath)       → set cover image
//   - deleteCollection(id)                      → delete collection + join rows
//   - addRecordToCollection(collectionId, recordId)    → link a record
//   - removeRecordFromCollection(collectionId, recordId) → unlink a record
//   - reorderCollectionRecords(collectionId, orderedRecordIds) → update positions
// ============================================================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, asc, count } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  collections,
  collectionRecords,
} from "@/db/schema";
import { getSession } from "@/lib/auth/session";

// ============================================================================
// SHARED TYPES
// ============================================================================

// Generic result type — same pattern as records.ts.
// Every mutation returns { success, error?, data? } so the UI can show
// feedback without try/catch everywhere.
type ActionResult<T = void> = {
  success: boolean;
  error?: string;
  data?: T;
};

// What getCollections() returns — lightweight summary for list views.
export type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  recordCount: number;
  createdAt: Date;
};

// What getCollection() returns — full detail with records.
export type CollectionDetail = {
  id: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  createdAt: Date;
  records: CollectionRecord[];
};

// A record within a collection, including its position for ordering.
export type CollectionRecord = {
  id: string;
  type: string;
  title: string | null;
  content: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  imagePath: string | null;
  note: string | null;
  createdAt: Date;
  position: number;
  tags: { id: string; name: string; isAi: boolean }[];
};

// ============================================================================
// AUTH HELPER
// ============================================================================

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.userId;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================
// Zod schemas for input validation. Every action that accepts user input
// validates it before touching the database.

const createCollectionSchema = z.object({
  name: z
    .string()
    .min(1, "Collection name is required")
    .max(100, "Collection name is too long"),
  description: z.string().max(500).optional(),
});

const renameCollectionSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1, "Collection name is required")
    .max(100, "Collection name is too long"),
});

const collectionRecordSchema = z.object({
  collectionId: z.string().uuid(),
  recordId: z.string().uuid(),
});

// ============================================================================
// GET ALL COLLECTIONS
// ============================================================================
// Returns all collections for the current user with a record count.
// Used in the filter drawer sidebar and any collection list views.
//
// We use a subquery for the count rather than fetching all records,
// keeping this lightweight for list views.

export async function getCollections(): Promise<CollectionSummary[]> {
  const userId = await requireUserId();

  // Fetch collections with a count of linked records.
  // Drizzle doesn't have a built-in "withCount" like some ORMs,
  // so we query collections then count records separately.
  const results = await db.query.collections.findMany({
    where: eq(collections.userId, userId),
    orderBy: asc(collections.name),
  });

  // Batch-fetch record counts for all collections.
  // One query per collection isn't ideal at scale, but for a personal app
  // with ~dozens of collections, it's fine and much simpler than a raw SQL join.
  const summaries: CollectionSummary[] = await Promise.all(
    results.map(async (c) => {
      const [countResult] = await db
        .select({ value: count() })
        .from(collectionRecords)
        .where(eq(collectionRecords.collectionId, c.id));

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        coverImage: c.coverImage,
        recordCount: countResult?.value ?? 0,
        createdAt: c.createdAt,
      };
    })
  );

  return summaries;
}

// ============================================================================
// GET SINGLE COLLECTION
// ============================================================================
// Returns a collection with all its records, ordered by position.
// Used for the collection detail page.
//
// We join through collection_records to get both the record data
// and the position within this collection.

export async function getCollection(
  id: string
): Promise<CollectionDetail | null> {
  const userId = await requireUserId();

  // First, verify the collection exists and belongs to this user.
  const collection = await db.query.collections.findFirst({
    where: and(eq(collections.id, id), eq(collections.userId, userId)),
  });

  if (!collection) return null;

  // Fetch records in this collection, ordered by position.
  // We join collection_records → records, then grab tags for each record.
  const linkedRecords = await db.query.collectionRecords.findMany({
    where: eq(collectionRecords.collectionId, id),
    orderBy: asc(collectionRecords.position),
    with: {
      record: {
        with: {
          recordTags: {
            with: {
              tag: true,
            },
          },
        },
      },
    },
  });

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    coverImage: collection.coverImage,
    createdAt: collection.createdAt,
    records: linkedRecords.map((lr) => ({
      id: lr.record.id,
      type: lr.record.type,
      title: lr.record.title,
      content: lr.record.content,
      sourceUrl: lr.record.sourceUrl,
      sourceAuthor: lr.record.sourceAuthor,
      imagePath: lr.record.imagePath,
      note: lr.record.note,
      createdAt: lr.record.createdAt,
      position: lr.position,
      tags: lr.record.recordTags.map((rt) => ({
        id: rt.tag.id,
        name: rt.tag.name,
        isAi: rt.tag.isAi,
      })),
    })),
  };
}

// ============================================================================
// CREATE COLLECTION
// ============================================================================
// Creates a new empty collection. Name is required, description is optional.

export async function createCollection(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();

  const parsed = createCollectionSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const [created] = await db
      .insert(collections)
      .values({
        userId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      })
      .returning({ id: collections.id });

    revalidatePath("/dashboard");
    return { success: true, data: { id: created.id } };
  } catch (error) {
    console.error("Failed to create collection:", error);
    return { success: false, error: "Failed to create collection." };
  }
}

// ============================================================================
// RENAME COLLECTION
// ============================================================================

export async function renameCollection(
  id: string,
  name: string
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = renameCollectionSchema.safeParse({ id, name });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const result = await db
      .update(collections)
      .set({ name: parsed.data.name })
      .where(
        and(eq(collections.id, parsed.data.id), eq(collections.userId, userId))
      )
      .returning();

    if (result.length === 0) {
      return { success: false, error: "Collection not found." };
    }

    revalidatePath("/dashboard");
    revalidatePath(`/collections/${id}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to rename collection:", error);
    return { success: false, error: "Failed to rename collection." };
  }
}

// ============================================================================
// UPDATE DESCRIPTION
// ============================================================================

export async function updateCollectionDescription(
  id: string,
  description: string | null
): Promise<ActionResult> {
  const userId = await requireUserId();

  try {
    const result = await db
      .update(collections)
      .set({ description })
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning();

    if (result.length === 0) {
      return { success: false, error: "Collection not found." };
    }

    revalidatePath(`/collections/${id}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to update collection description:", error);
    return { success: false, error: "Failed to update description." };
  }
}

// ============================================================================
// UPDATE COVER IMAGE
// ============================================================================
// Sets or clears the cover image path. Pass null to remove.

export async function updateCollectionCover(
  id: string,
  imagePath: string | null
): Promise<ActionResult> {
  const userId = await requireUserId();

  try {
    const result = await db
      .update(collections)
      .set({ coverImage: imagePath })
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning();

    if (result.length === 0) {
      return { success: false, error: "Collection not found." };
    }

    revalidatePath(`/collections/${id}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Failed to update cover image:", error);
    return { success: false, error: "Failed to update cover image." };
  }
}

// ============================================================================
// DELETE COLLECTION
// ============================================================================
// Deletes a collection and all its join table rows.
// Does NOT delete the records themselves — they just lose the collection link.
// Same FK cleanup pattern as deleteRecord in records.ts.

export async function deleteCollection(id: string): Promise<ActionResult> {
  const userId = await requireUserId();

  try {
    // Delete join table rows first (FK constraint).
    await db
      .delete(collectionRecords)
      .where(eq(collectionRecords.collectionId, id));

    const result = await db
      .delete(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning();

    if (result.length === 0) {
      return { success: false, error: "Collection not found." };
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete collection:", error);
    return { success: false, error: "Failed to delete collection." };
  }
}

// ============================================================================
// ADD RECORD TO COLLECTION
// ============================================================================
// Links a record to a collection. The new record gets the highest position
// (appended to the end). We use gaps of 10 between positions so that
// drag-and-drop reordering (to-do #5) can insert between items without
// renumbering everything.
//
// If the record is already in the collection, this is a no-op (the
// composite primary key on collection_records prevents duplicates).

export async function addRecordToCollection(
  collectionId: string,
  recordId: string
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = collectionRecordSchema.safeParse({ collectionId, recordId });
  if (!parsed.success) {
    return { success: false, error: "Invalid input." };
  }

  // Verify the collection belongs to this user.
  const collection = await db.query.collections.findFirst({
    where: and(
      eq(collections.id, parsed.data.collectionId),
      eq(collections.userId, userId)
    ),
  });

  if (!collection) {
    return { success: false, error: "Collection not found." };
  }

  try {
    // Find the current highest position in the collection.
    // New records go at the end, with a gap of 10.
    const existing = await db.query.collectionRecords.findMany({
      where: eq(collectionRecords.collectionId, parsed.data.collectionId),
      columns: { position: true },
    });

    const maxPosition =
      existing.length > 0
        ? Math.max(...existing.map((r) => r.position))
        : -10; // Start at 0 if empty

    const newPosition = maxPosition + 10;

    // Insert the link. onConflictDoNothing handles the case where the
    // record is already in this collection — just silently skip.
    await db
      .insert(collectionRecords)
      .values({
        collectionId: parsed.data.collectionId,
        recordId: parsed.data.recordId,
        position: newPosition,
      })
      .onConflictDoNothing();

    revalidatePath("/dashboard");
    revalidatePath(`/collections/${collectionId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to add record to collection:", error);
    return { success: false, error: "Failed to add record to collection." };
  }
}

// ============================================================================
// REMOVE RECORD FROM COLLECTION
// ============================================================================
// Unlinks a record from a collection. The record itself is not deleted.

export async function removeRecordFromCollection(
  collectionId: string,
  recordId: string
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = collectionRecordSchema.safeParse({ collectionId, recordId });
  if (!parsed.success) {
    return { success: false, error: "Invalid input." };
  }

  // Verify the collection belongs to this user.
  const collection = await db.query.collections.findFirst({
    where: and(
      eq(collections.id, parsed.data.collectionId),
      eq(collections.userId, userId)
    ),
  });

  if (!collection) {
    return { success: false, error: "Collection not found." };
  }

  try {
    await db
      .delete(collectionRecords)
      .where(
        and(
          eq(collectionRecords.collectionId, parsed.data.collectionId),
          eq(collectionRecords.recordId, parsed.data.recordId)
        )
      );

    revalidatePath("/dashboard");
    revalidatePath(`/collections/${collectionId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to remove record from collection:", error);
    return {
      success: false,
      error: "Failed to remove record from collection.",
    };
  }
}

// ============================================================================
// REORDER RECORDS IN COLLECTION
// ============================================================================
// Updates the position of every record in a collection based on the new order.
// Called after a drag-and-drop reorder.
//
// We receive the full list of record IDs in their new order and assign
// fresh positions with gaps of 10. This is simpler than calculating a
// single insertion point, and since it only runs on user-initiated reorder
// (not high-frequency), the extra updates are fine.
//
// Why gaps of 10? So future single-item insertions (addRecordToCollection)
// can slot in between without a full renumber. But after a reorder we
// renumber everything cleanly anyway.

export async function reorderCollectionRecords(
  collectionId: string,
  orderedRecordIds: string[]
): Promise<ActionResult> {
  const userId = await requireUserId();

  // Verify the collection belongs to this user.
  const collection = await db.query.collections.findFirst({
    where: and(
      eq(collections.id, collectionId),
      eq(collections.userId, userId)
    ),
  });

  if (!collection) {
    return { success: false, error: "Collection not found." };
  }

  try {
    // Update each record's position. Position = index * 10.
    // We run these in parallel since they're independent updates.
    await Promise.all(
      orderedRecordIds.map((recordId, index) =>
        db
          .update(collectionRecords)
          .set({ position: index * 10 })
          .where(
            and(
              eq(collectionRecords.collectionId, collectionId),
              eq(collectionRecords.recordId, recordId)
            )
          )
      )
    );

    revalidatePath(`/collections/${collectionId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to reorder collection records:", error);
    return { success: false, error: "Failed to reorder records." };
  }
}
