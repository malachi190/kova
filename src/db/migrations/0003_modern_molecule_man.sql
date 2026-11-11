CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"refresh_token_hash" char(64) NOT NULL,
	"previous_refresh_token_hash" char(64),
	"creation_key_hash" char(64) NOT NULL,
	"rotation_key_hash" char(64),
	"token_version" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_idx" ON "auth_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_creation_key_hash_idx" ON "auth_sessions" USING btree ("creation_key_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_vendor_idx" ON "auth_sessions" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_previous_refresh_hash_idx" ON "auth_sessions" USING btree ("previous_refresh_token_hash");