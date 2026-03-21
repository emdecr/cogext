ALTER TABLE "records" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "embedding_model" text;