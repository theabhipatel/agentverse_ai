CREATE TABLE "llm_providers" (
	"provider" text PRIMARY KEY NOT NULL,
	"api_key_cipher" text NOT NULL,
	"api_key_last6" text NOT NULL,
	"base_url" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"chat_provider" text NOT NULL,
	"chat_model" text NOT NULL,
	"voice_provider" text,
	"voice_model" text,
	"stt_model" text NOT NULL,
	"tts_model" text NOT NULL,
	"tts_voice" text NOT NULL,
	"embedding_model" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_providers" ADD CONSTRAINT "llm_providers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_settings" ADD CONSTRAINT "llm_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;