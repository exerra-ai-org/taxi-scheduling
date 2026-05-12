-- 001_terms_cash_arrivals_settings.sql
--
-- Forward-only, idempotent. Adds:
--   • users.terms_accepted_at
--   • booking_payment_method enum + bookings.payment_method
--   • bookings.deposit_pence, balance_due_pence, cash_collected_at
--   • bookings.driver_arrived_at, customer_arrived_at,
--     waiting_fee_pence, no_show_at
--   • app_settings table + default rows
--
-- Every statement uses IF NOT EXISTS / DO blocks so re-running is safe
-- and existing rows are untouched.

BEGIN;

-- 1. New enum (guarded — CREATE TYPE has no IF NOT EXISTS in pg <13 idioms)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_payment_method') THEN
        CREATE TYPE "public"."booking_payment_method" AS ENUM ('card', 'cash');
    END IF;
END
$$;

-- 2. users.terms_accepted_at (nullable — legacy users have no stamp)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp;

-- 3. bookings: new columns, all default to zero / null so existing rows survive
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "payment_method" "booking_payment_method" NOT NULL DEFAULT 'card';
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "deposit_pence" integer NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "balance_due_pence" integer NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cash_collected_at" timestamp;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "driver_arrived_at" timestamp;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "customer_arrived_at" timestamp;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "waiting_fee_pence" integer NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "no_show_at" timestamp;

-- 4. app_settings table
CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" text PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
    "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 5. Seed defaults (idempotent: ON CONFLICT DO NOTHING keeps any admin-edited values)
INSERT INTO "app_settings" ("key", "value") VALUES
    ('adminContactPhone', ''),
    ('emergencyNumber', '999'),
    ('waitingFreeMinutes', '30'),
    ('waitingRatePence', '200'),
    ('waitingIncrementMinutes', '5'),
    ('noShowAfterMinutes', '45')
ON CONFLICT ("key") DO NOTHING;

COMMIT;
