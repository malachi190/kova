CREATE TYPE "public"."vendor_status" AS ENUM('PENDING_VERIFICATION', 'ACTIVE', 'FROZEN');--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"store_name" text NOT NULL,
	"phone" text,
	"status" "vendor_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_email_unique_idx" ON "vendors" USING btree ("email");