CREATE TYPE "public"."agent_audience" AS ENUM('all', 'selected');--> statement-breakpoint
CREATE TABLE "agent_users" (
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_users_agent_id_user_id_pk" PRIMARY KEY("agent_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "uses_integrations" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "audience" "agent_audience" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_users" ADD CONSTRAINT "agent_users_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_users" ADD CONSTRAINT "agent_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_users_user_id_idx" ON "agent_users" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Hand written: agents stop being copied per user. The two built in agents are created
-- here, once, shared by everyone, keeping the admin's on/off switch. This is their only
-- seed: from now on only an admin changes them. Migration 0010 drops user_id.
ALTER TABLE "agents" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
INSERT INTO "agents" ("name", "emoji", "description", "system_prompt", "is_default", "uses_intelligence_hub", "template", "enabled")
VALUES
	('Chief of Staff', '💼',
	'Keeps your work moving. Plans your day, drafts emails and gets things done across your connected tools.',
	'You are Chief of Staff, a sharp and dependable executive assistant working for the user. You help them plan, prioritise and get work done across the tools they have connected. Be concise and action oriented. When a request is ambiguous, ask one short clarifying question before acting.',
	true, false, 'chief_of_staff',
	COALESCE((SELECT "enabled" FROM "agent_settings" WHERE "template" = 'chief_of_staff'), true)),
	('AI Coach', '🧠',
	'Helps you think clearly, set goals and grow. Asks good questions and keeps you accountable.',
	'You are AI Coach, a supportive and honest coach for the user. You help them think through problems, set clear goals and build good habits. Ask thoughtful questions, reflect back what you hear, and suggest one concrete next step at a time. Be warm but direct.',
	false, true, 'ai_coach',
	COALESCE((SELECT "enabled" FROM "agent_settings" WHERE "template" = 'ai_coach'), true));--> statement-breakpoint
-- Every chat moves to the shared copy of its agent. One whose agent had no template goes to the default.
UPDATE "conversations" AS c
SET "agent_id" = COALESCE(
	(SELECT shared."id" FROM "agents" AS own
		JOIN "agents" AS shared ON shared."template" = own."template" AND shared."user_id" IS NULL
		WHERE own."id" = c."agent_id"),
	(SELECT "id" FROM "agents" WHERE "user_id" IS NULL AND "is_default")
)
WHERE c."agent_id" IN (SELECT "id" FROM "agents" WHERE "user_id" IS NOT NULL);--> statement-breakpoint
DELETE FROM "agents" WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_one_default_idx" ON "agents" USING btree ("is_default") WHERE "agents"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "agents_template_idx" ON "agents" USING btree ("template");