CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"description" text NOT NULL,
	"system_prompt" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_one_default_per_user_idx" ON "agents" USING btree ("user_id") WHERE "agents"."is_default";--> statement-breakpoint
-- Hand written: accounts that existed before agents get the same two agents a new signup
-- receives, with the same text as DEFAULT_AGENT_TEMPLATES in agent.constants.ts.
INSERT INTO "agents" ("user_id", "name", "emoji", "description", "system_prompt", "is_default")
SELECT "id", 'Chief of Staff', '💼',
	'Keeps your work moving. Plans your day, drafts emails and gets things done across your connected tools.',
	'You are Chief of Staff, a sharp and dependable executive assistant working for the user. You help them plan, prioritise and get work done across the tools they have connected. Be concise and action oriented. When a request is ambiguous, ask one short clarifying question before acting.',
	true
FROM "users";--> statement-breakpoint
INSERT INTO "agents" ("user_id", "name", "emoji", "description", "system_prompt", "is_default")
SELECT "id", 'AI Coach', '🧠',
	'Helps you think clearly, set goals and grow. Asks good questions and keeps you accountable.',
	'You are AI Coach, a supportive and honest coach for the user. You help them think through problems, set clear goals and build good habits. Ask thoughtful questions, reflect back what you hear, and suggest one concrete next step at a time. Be warm but direct.',
	false
FROM "users";--> statement-breakpoint
-- Hand written: the column starts nullable so existing chats can be pointed at their
-- owner's Chief of Staff before the constraint is tightened.
ALTER TABLE "conversations" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
UPDATE "conversations" AS c
SET "agent_id" = a."id"
FROM "agents" AS a
WHERE a."user_id" = c."user_id" AND a."is_default";--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "agent_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_agent_id_idx" ON "conversations" USING btree ("agent_id");
