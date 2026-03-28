-- Switching embedding provider from Ollama nomic-embed-text (768-dim) to
-- Voyage AI voyage-3-lite (512-dim). Existing embeddings are incompatible
-- with the new dimension, so we null them out and rebuild.

-- Drop the HNSW index before altering the column type
DROP INDEX IF EXISTS "records_embedding_idx";

-- Null out existing embeddings BEFORE altering the column type.
-- pgvector validates dimensions on ALTER, so existing 768-dim vectors
-- must be removed first or the ALTER will fail.
UPDATE "records" SET "embedding" = NULL, "embedding_model" = NULL WHERE "embedding" IS NOT NULL;

-- Change vector dimension from 768 to 512
ALTER TABLE "records" ALTER COLUMN "embedding" SET DATA TYPE vector(512);

-- Recreate the HNSW index for the new dimension
CREATE INDEX "records_embedding_idx" ON "records" USING hnsw ("embedding" vector_cosine_ops);