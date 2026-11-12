-- Add the music shelf type and a subtitle column (shown for books only).
-- Purely additive, so a rolled-back image keeps working: it never selects
-- `subtitle`, and an unknown 'music' type falls back to generic styling.
-- ADD VALUE IF NOT EXISTS: re-runnable on dev DBs (enum values can't be removed).
-- See plans/2026-11-12-music-type-book-subtitle.md.
ALTER TYPE "public"."record_type" ADD VALUE IF NOT EXISTS 'music';--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "subtitle" text;
