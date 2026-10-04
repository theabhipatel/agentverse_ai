-- The database now runs on the pgvector image, which is Debian (glibc) where the
-- old image was Alpine (musl). The two sort text differently, so every index over
-- text is rebuilt once here, or lookups like login by email could miss rows.
REINDEX TABLE "users";--> statement-breakpoint
REINDEX TABLE "password_reset_tokens";--> statement-breakpoint
REINDEX TABLE "user_integrations";--> statement-breakpoint
REINDEX TABLE "integration_settings";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_type" AS ENUM('file', 'url');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source_type" "knowledge_source_type" NOT NULL,
	"file_name" text,
	"mime_type" text,
	"file_size" integer,
	"storage_key" text,
	"url" text,
	"status" "knowledge_status" DEFAULT 'processing' NOT NULL,
	"error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "uses_intelligence_hub" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sources" jsonb;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_document_id_idx" ON "knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
-- Every existing AI Coach answers from the Intelligence Hub, like new ones will.
UPDATE "agents" SET "uses_intelligence_hub" = true WHERE "name" = 'AI Coach';
