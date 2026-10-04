CREATE TABLE "agent_settings" (
	"template" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "template" text;--> statement-breakpoint
-- Every agent so far was copied from one of the two built in templates, and none can be renamed yet.
UPDATE "agents" SET "template" = 'chief_of_staff' WHERE "name" = 'Chief of Staff';--> statement-breakpoint
UPDATE "agents" SET "template" = 'ai_coach' WHERE "name" = 'AI Coach';
