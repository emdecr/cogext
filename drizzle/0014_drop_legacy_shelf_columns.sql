-- CONTRACT step for 0013: drop the legacy book-only shelf columns and enum.
-- 0013 backfilled shelf_status/date_finished from these and the app stopped
-- using them; they were kept only so a rolled-back pre-0013 image would still
-- work. Verified in prod before dropping: every book with reading_status had
-- a shelf_status (0 missed). After this, rolling back past 0013 is unsafe.
ALTER TABLE "records" DROP COLUMN "reading_status";--> statement-breakpoint
ALTER TABLE "records" DROP COLUMN "date_read";--> statement-breakpoint
DROP TYPE "public"."reading_status";