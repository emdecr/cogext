-- Generalize the book-only shelf to a medium-neutral one and add movie/show.
-- Hand-written: drizzle-kit can't generate renames non-interactively. All
-- renames are catalog-only (no row rewrite); existing book rows carry over
-- (want_to_read→want, reading→in_progress, read→done).
-- See plans/2026-11-06-movie-show-record-types.md.
ALTER TYPE "public"."reading_status" RENAME TO "shelf_status";--> statement-breakpoint
ALTER TYPE "public"."shelf_status" RENAME VALUE 'want_to_read' TO 'want';--> statement-breakpoint
ALTER TYPE "public"."shelf_status" RENAME VALUE 'reading' TO 'in_progress';--> statement-breakpoint
ALTER TYPE "public"."shelf_status" RENAME VALUE 'read' TO 'done';--> statement-breakpoint
ALTER TABLE "records" RENAME COLUMN "reading_status" TO "shelf_status";--> statement-breakpoint
ALTER TABLE "records" RENAME COLUMN "date_read" TO "date_finished";--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "release_year" integer;--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'movie';--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'show';
