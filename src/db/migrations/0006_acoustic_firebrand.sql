DROP INDEX "auth_sessions_creation_key_hash_idx";--> statement-breakpoint
ALTER TABLE "auth_session_refresh_tokens" DROP COLUMN "rotation_key_hash";--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP COLUMN "creation_key_hash";--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP COLUMN "rotation_key_hash";