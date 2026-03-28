// =============================================================================
// RE-EMBED ALL RECORDS
// =============================================================================
//
// One-time script to regenerate embeddings for all records after switching
// embedding providers (e.g., Ollama nomic-embed-text → Voyage AI voyage-3-lite).
//
// The migration (0006_rainy_beast.sql) nulls out all existing embeddings
// because the old 768-dim vectors are incompatible with the new 1024-dim
// column. This script fills them back in.
//
// Usage:
//   npx tsx scripts/re-embed-all.ts                  (local)
//   docker compose exec app npx tsx re-embed-all.ts  (prod, if tsx available)
//
// Requires: DATABASE_URL, VOYAGE_API_KEY in environment.
// =============================================================================

import { eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { records } from "../src/db/schema";
import { prepareTextForEmbedding } from "../src/lib/ai/embed-record";
import { VoyageEmbeddingProvider } from "../src/lib/ai/voyage-embedding";

const BATCH_SIZE = 20; // Voyage supports up to 128, but 20 is safe for rate limits

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  if (!process.env.VOYAGE_API_KEY) {
    console.error("VOYAGE_API_KEY is not set.");
    process.exit(1);
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);
  const provider = new VoyageEmbeddingProvider();
  const modelName = process.env.EMBED_MODEL || "voyage-3-lite";

  try {
    // Get all records that need embedding
    const toEmbed = await db
      .select({
        id: records.id,
        title: records.title,
        content: records.content,
        sourceAuthor: records.sourceAuthor,
        note: records.note,
        type: records.type,
      })
      .from(records)
      .where(isNull(records.embedding));

    console.log(`Found ${toEmbed.length} records to embed.`);

    if (toEmbed.length === 0) {
      console.log("Nothing to do.");
      return;
    }

    let embedded = 0;

    // Process in batches
    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const batch = toEmbed.slice(i, i + BATCH_SIZE);
      const texts = batch.map(prepareTextForEmbedding);

      const embeddings = await provider.embedBatch(texts);

      // Update each record
      await Promise.all(
        batch.map((record, j) =>
          db
            .update(records)
            .set({ embedding: embeddings[j], embeddingModel: modelName })
            .where(eq(records.id, record.id))
        )
      );

      embedded += batch.length;
      console.log(`Embedded ${embedded}/${toEmbed.length} records...`);
    }

    console.log(`Done. All ${embedded} records embedded with ${modelName}.`);
  } catch (error) {
    console.error("Re-embedding failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
