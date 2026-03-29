-- Upgrade from voyage-3-lite (512-dim) to voyage-4-lite (1024-dim).
-- Existing embeddings are incompatible with the new model, so we null
-- them out and rebuild via scripts/re-embed-all.ts.

DROP INDEX IF EXISTS "records_embedding_idx";

UPDATE "records" SET "embedding" = NULL, "embedding_model" = NULL WHERE "embedding" IS NOT NULL;

ALTER TABLE "records" ALTER COLUMN "embedding" SET DATA TYPE vector(1024);

CREATE INDEX "records_embedding_idx" ON "records" USING hnsw ("embedding" vector_cosine_ops);
