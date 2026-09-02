CREATE TYPE "public"."auth_event_type" AS ENUM('login_success', 'login_failure', 'register', 'register_blocked', 'logout');--> statement-breakpoint
CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "auth_event_type" NOT NULL,
	"email" text,
	"user_id" uuid,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_events_created_at_idx" ON "auth_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_events_event_type_idx" ON "auth_events" USING btree ("event_type");