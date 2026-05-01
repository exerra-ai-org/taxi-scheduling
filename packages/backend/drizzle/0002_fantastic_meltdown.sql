-- Canonicalise existing user emails to lowercase. Application code now
-- writes lowercase via normalizeEmail() and reads via direct equality
-- on the unique btree, so no functional index is needed.
UPDATE "users" SET "email" = LOWER("email") WHERE "email" <> LOWER("email");--> statement-breakpoint
DROP INDEX IF EXISTS "idx_users_email_lower";