// ============================================================================
// RECORD EMBEDDING SERVICE
// ============================================================================
//
// This module handles embedding records — converting their text content into
// vectors and storing them in the database.
//
// It's called AFTER a record is created or updated. It runs separately from
// the main save flow so that:
//   1. Record creation stays fast (embedding takes 100-500ms)
//   2. If Ollama is down, the record still saves
//   3. We can re-embed records later (e.g., when switching models)
//
// The flow:
//   1. Take a record's text fields (title, content, note, tags)
//   2. Concatenate them into a single string
//   3. Send to the embedding provider → get back 768 numbers
//   4. Store those numbers in the record's `embedding` column
// ============================================================================

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { records } from "@/db/schema";
import { getEmbeddingProvider } from "@/lib/ai";

// ============================================================================
// PREPARE TEXT FOR EMBEDDING
// ============================================================================
// We combine all meaningful text fields into one string for embedding.
// Why combine instead of embedding each field separately?
//   - One embedding per record is simpler and cheaper
//   - The embedding captures the OVERALL meaning of the record
//   - Individual fields alone might lack context ("Untitled" tells us nothing,
//     but "Untitled" + content about pasta recipes does)
//
// We prefix each section so the model understands the structure.
// "Title: Quick Pasta" gives more signal than just "Quick Pasta".

// Exported so unit tests can verify the text preparation logic directly.
// This function is pure — no side effects, no I/O — making it ideal to
// test in isolation without mocking the database or embedding provider.
export function prepareTextForEmbedding(record: {
  title: string | null;
  content: string;
  sourceAuthor: string | null;
  note: string | null;
  type: string;
}): string {
  const parts: string[] = [];

  // Include the record type for context
  parts.push(`Type: ${record.type}`);

  if (record.title) {
    parts.push(`Title: ${record.title}`);
  }

  parts.push(`Content: ${record.content}`);

  if (record.sourceAuthor) {
    parts.push(`Author: ${record.sourceAuthor}`);
  }

  if (record.note) {
    parts.push(`Note: ${record.note}`);
  }

  return parts.join("\n");
}

// ============================================================================
// EMBED A SINGLE RECORD
// ============================================================================
// Called after record creation or update. Fetches the record, embeds its
// text, and updates the embedding column.
//
// Returns void — embedding failures are logged but don't throw.
// The record is already saved; the embedding is a best-effort enhancement.

export async function embedRecord(recordId: string): Promise<void> {
  try {
    // Fetch the record to get its current text content
    const record = await db.query.records.findFirst({
      where: eq(records.id, recordId),
    });

    if (!record) {
      console.warn(`embedRecord: record ${recordId} not found`);
      return;
    }

    // Prepare the text and generate the embedding
    const text = prepareTextForEmbedding(record);
    const provider = await getEmbeddingProvider();
    const embedding = await provider.embed(text);

    // Store the embedding AND the model name in the database.
    // The model name lets us identify which records need re-embedding
    // if we ever switch to a different embedding provider.
    await db
      .update(records)
      .set({
        embedding,
        embeddingModel: process.env.EMBED_MODEL || "voyage-4-lite",
      })
      .where(eq(records.id, recordId));
  } catch (error) {
    // Log but don't throw — embedding failure shouldn't break the app.
    // The record exists and is usable; it just won't appear in
    // semantic search results until it's embedded.
    console.error(`Failed to embed record ${recordId}:`, error);
  }
}

// ============================================================================
// EMBED MULTIPLE RECORDS (BATCH)
// ============================================================================
// Used for backfilling — when you want to embed all existing records
// that don't have embeddings yet. More efficient than calling embedRecord
// one at a time because the provider can batch the API calls.

export async function embedRecordsBatch(recordIds: string[]): Promise<void> {
  try {
    // Fetch all records
    const recordList = await Promise.all(
      recordIds.map((id) =>
        db.query.records.findFirst({ where: eq(records.id, id) }),
      ),
    );

    // Filter out any not found and prepare texts
    const validRecords = recordList.filter(
      (r): r is NonNullable<typeof r> => r !== undefined,
    );

    if (validRecords.length === 0) return;

    const texts = validRecords.map(prepareTextForEmbedding);

    // Batch embed
    const provider = await getEmbeddingProvider();
    const embeddings = await provider.embedBatch(texts);

    // Update each record with its embedding and model name
    const modelName = process.env.EMBED_MODEL || "voyage-4-lite";
    await Promise.all(
      validRecords.map((record, i) =>
        db
          .update(records)
          .set({ embedding: embeddings[i], embeddingModel: modelName })
          .where(eq(records.id, record.id)),
      ),
    );
  } catch (error) {
    console.error("Batch embedding failed:", error);
  }
}
