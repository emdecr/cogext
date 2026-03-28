// =============================================================================
// RE-EMBED ALL RECORDS
// =============================================================================
//
// One-time script to regenerate embeddings for all records after switching
// embedding providers (e.g., Ollama nomic-embed-text → Voyage AI voyage-3-lite).
//
// The migration (0006_rainy_beast.sql) nulls out all existing embeddings
// because the old 768-dim vectors are incompatible with the new 512-dim
// column. This script fills them back in.
//
// Usage (local):
//   set -a && source .env.local && set +a && npx tsx scripts/re-embed-all.ts
//
//   set -a / set +a ensures sourced variables are exported to child processes.
//   Next.js loads .env.local automatically, but standalone scripts need this.
//
// Usage (prod):
//   docker compose exec app npx tsx re-embed-all.ts  (if tsx available)
//
// Requires: DATABASE_URL, VOYAGE_API_KEY in environment.
// =============================================================================

import { eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { records } from "../src/db/schema";
import { VoyageEmbeddingProvider } from "../src/lib/ai/voyage-embedding";

// Inlined from src/lib/ai/embed-record.ts to avoid importing the app's
// DB connection (src/db/index.ts), which throws if DATABASE_URL isn't
// loaded via Next.js env handling. This script manages its own connection.
function prepareTextForEmbedding(record: {
  title: string | null;
  content: string;
  sourceAuthor: string | null;
  note: string | null;
  type: string;
}): string {
  const parts: string[] = [];
  parts.push(`Type: ${record.type}`);
  if (record.title) parts.push(`Title: ${record.title}`);
  parts.push(`Content: ${record.content}`);
  if (record.sourceAuthor) parts.push(`Author: ${record.sourceAuthor}`);
  if (record.note) parts.push(`Note: ${record.note}`);
  return parts.join("\n");
}

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
