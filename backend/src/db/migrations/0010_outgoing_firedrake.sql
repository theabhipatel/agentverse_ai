ALTER TABLE "agent_settings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_settings" CASCADE;--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "agents_user_id_idx";--> statement-breakpoint
DROP INDEX "agents_one_default_per_user_idx";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "user_id";