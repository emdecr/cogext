-- Generalize the book-only shelf to a medium-neutral one and add movie/show.
-- EXPAND step of expand/contract: the new shelf_status / date_finished columns
-- sit alongside the legacy reading_status / date_read, which are backfilled
-- into them and then left untouched. A rolled-back image (which reads the
-- legacy columns) keeps working. A later migration drops the legacy columns
-- and the reading_status enum once this release is confirmed in prod.
-- ADD VALUE IF NOT EXISTS: re-runnable on dev DBs that applied an earlier
-- draft of this migration (enum values can't be removed).
-- See plans/2026-11-06-movie-show-record-types.md.
CREATE TYPE "public"."shelf_status" AS ENUM('want', 'in_progress', 'done');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE IF NOT EXISTS 'movie';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE IF NOT EXISTS 'show';--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "shelf_status" "shelf_status";--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "date_finished" date;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "release_year" integer;--> statement-breakpoint
-- Backfill: copy existing book shelf data into the new columns.
UPDATE "records"
SET
  "shelf_status" = CASE "reading_status"
    WHEN 'want_to_read' THEN 'want'::"shelf_status"
    WHEN 'reading' THEN 'in_progress'::"shelf_status"
    WHEN 'read' THEN 'done'::"shelf_status"
  END,
  "date_finished" = "date_read"
WHERE "reading_status" IS NOT NULL OR "date_read" IS NOT NULL;
