ALTER TABLE "llm_settings" ADD COLUMN "stt_provider" text DEFAULT 'groq' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_settings" ADD COLUMN "tts_provider" text DEFAULT 'minimax' NOT NULL;