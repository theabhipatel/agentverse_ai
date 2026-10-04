CREATE TABLE "user_disabled_toolkits" (
	"user_id" uuid NOT NULL,
	"toolkit" text NOT NULL,
	CONSTRAINT "user_disabled_toolkits_user_id_toolkit_pk" PRIMARY KEY("user_id","toolkit")
);
--> statement-breakpoint
ALTER TABLE "user_disabled_toolkits" ADD CONSTRAINT "user_disabled_toolkits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;