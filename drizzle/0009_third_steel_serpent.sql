CREATE TYPE "public"."reading_status" AS ENUM('want_to_read', 'reading', 'read');--> statement-breakpoint
ALTER TYPE "public"."record_type" ADD VALUE 'book';--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "rating" real;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "reading_status" "reading_status";--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "date_read" date;