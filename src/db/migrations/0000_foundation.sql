CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"scope" varchar(255) NOT NULL,
	"key" varchar(255) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");
--> statement-breakpoint
CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();
