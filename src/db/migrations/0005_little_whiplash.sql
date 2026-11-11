DROP INDEX "auth_sessions_creation_key_hash_idx";--> statement-breakpoint
CREATE INDEX "auth_sessions_creation_key_hash_idx" ON "auth_sessions" USING btree ("creation_key_hash");