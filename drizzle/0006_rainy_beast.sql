-- Switching embedding provider from Ollama nomic-embed-text (768-dim) to
-- Voyage AI voyage-3-lite (1024-dim). Existing embeddings are incompatible
-- with the new dimension, so we null them out and rebuild.

-- Drop the HNSW index before altering the column type
DROP INDEX IF EXISTS "records_embedding_idx";

-- Change vector dimension from 768 to 1024
ALTER TABLE "records" ALTER COLUMN "embedding" SET DATA TYPE vector(1024);

-- Null out existing embeddings (768-dim vectors can't live in a 1024-dim column)
-- The re-embedding script (scripts/re-embed-all.ts) will regenerate them.
UPDATE "records" SET "embedding" = NULL, "embedding_model" = NULL WHERE "embedding" IS NOT NULL;

-- Recreate the HNSW index for the new dimension
CREATE INDEX "records_embedding_idx" ON "records" USING hnsw ("embedding" vector_cosine_ops);