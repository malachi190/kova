CREATE TABLE "auth_session_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"replaced_by_version" integer NOT NULL,
	"rotation_key_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_session_refresh_tokens" ADD CONSTRAINT "auth_session_refresh_tokens_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_session_refresh_tokens_hash_idx" ON "auth_session_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_session_refresh_tokens_session_idx" ON "auth_session_refresh_tokens" USING btree ("session_id");