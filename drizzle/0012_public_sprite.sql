CREATE TYPE "public"."ai_call_status" AS ENUM('ok', 'error', 'refusal');--> statement-breakpoint
ALTER TYPE "public"."ai_feature" ADD VALUE 'embedding';--> statement-breakpoint
ALTER TYPE "public"."ai_provider" ADD VALUE 'voyage';--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "status" "ai_call_status" DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "error_kind" text;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "error_message" text;--> statement-breakpoint
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage" USING btree ("created_at");