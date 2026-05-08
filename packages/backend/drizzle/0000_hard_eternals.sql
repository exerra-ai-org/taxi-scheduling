CREATE TYPE "public"."booking_status" AS ENUM('scheduled', 'assigned', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('fixed', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."driver_assignment_role" AS ENUM('primary', 'backup');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_type" AS ENUM('payment_intent', 'setup_intent');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'pending', 'requires_action', 'authorized', 'captured', 'partially_refunded', 'refunded', 'failed', 'disputed', 'uncollectible');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('requested_by_customer', 'duplicate', 'fraudulent', 'service_failure', 'route_change', 'cancellation_full', 'cancellation_partial', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'admin', 'driver');--> statement-breakpoint
CREATE TYPE "public"."vehicle_class" AS ENUM('regular', 'comfort', 'max');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"pickup_address" text NOT NULL,
	"dropoff_address" text NOT NULL,
	"pickup_lat" double precision,
	"pickup_lon" double precision,
	"dropoff_lat" double precision,
	"dropoff_lon" double precision,
	"pickup_zone_id" integer,
	"dropoff_zone_id" integer,
	"fixed_route_id" integer,
	"scheduled_at" timestamp NOT NULL,
	"price_pence" integer NOT NULL,
	"discount_pence" integer DEFAULT 0 NOT NULL,
	"coupon_id" integer,
	"status" "booking_status" DEFAULT 'scheduled' NOT NULL,
	"is_airport" boolean DEFAULT false NOT NULL,
	"flight_number" text,
	"pickup_flight_number" text,
	"dropoff_flight_number" text,
	"vehicle_class" "vehicle_class" DEFAULT 'regular' NOT NULL,
	"distance_miles" double precision,
	"rate_per_mile_pence" integer,
	"base_fare_pence" integer,
	"snapped_path" jsonb,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"active_payment_intent_id" text,
	"payment_method_id" text,
	"amount_authorized_pence" integer DEFAULT 0 NOT NULL,
	"amount_captured_pence" integer DEFAULT 0 NOT NULL,
	"amount_refunded_pence" integer DEFAULT 0 NOT NULL,
	"cancellation_fee_pence" integer DEFAULT 0 NOT NULL,
	"payment_hold_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"expires_at" timestamp,
	"max_uses" integer,
	"current_uses" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"stripe_dispute_id" text NOT NULL,
	"amount_pence" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"evidence_due_by" timestamp,
	"evidence_submitted_at" timestamp,
	"outcome" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_stripe_dispute_id_unique" UNIQUE("stripe_dispute_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"role" "driver_assignment_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_heartbeats" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"last_heartbeat_at" timestamp DEFAULT now() NOT NULL,
	"missed_windows" integer DEFAULT 0 NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"pickup_geofence_since" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_location_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"accuracy_m" double precision,
	"speed_mps" double precision,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_presence" (
	"driver_id" integer PRIMARY KEY NOT NULL,
	"is_on_duty" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp,
	"last_lat" double precision,
	"last_lon" double precision,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_profiles" (
	"driver_id" integer PRIMARY KEY NOT NULL,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_year" integer,
	"vehicle_color" text,
	"license_plate" text,
	"vehicle_class" "vehicle_class",
	"bio" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fixed_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"from_label" text NOT NULL,
	"to_label" text NOT NULL,
	"price_pence" integer NOT NULL,
	"vehicle_type" text DEFAULT 'standard' NOT NULL,
	"is_airport" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"reporter_id" integer NOT NULL,
	"type" text DEFAULT 'contact_admin' NOT NULL,
	"message" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mile_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_class" "vehicle_class" NOT NULL,
	"base_fare_pence" integer NOT NULL,
	"rate_per_mile_pence" integer NOT NULL,
	CONSTRAINT "mile_rates_vehicle_class_unique" UNIQUE("vehicle_class")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"booking_id" integer,
	"user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"stripe_intent_id" text NOT NULL,
	"intent_type" "payment_intent_type" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_pence" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'gbp' NOT NULL,
	"payment_method_id" text,
	"stripe_charge_id" text,
	"last_error_code" text,
	"last_error_message" text,
	"idempotency_key" text,
	"captured_at" timestamp,
	"voided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_intent_id_unique" UNIQUE("stripe_intent_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"stripe_refund_id" text NOT NULL,
	"amount_pence" integer NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"admin_note" text,
	"initiated_by_user_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_stripe_refund_id_unique" UNIQUE("stripe_refund_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"password_hash" text,
	"magic_link_token" text,
	"magic_link_expires_at" timestamp,
	"reset_password_token" text,
	"reset_password_expires_at" timestamp,
	"invitation_token" text,
	"invitation_token_expires_at" timestamp,
	"profile_picture_url" text,
	"stripe_customer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"class" "vehicle_class" NOT NULL,
	"name" text NOT NULL,
	"passenger_capacity" integer NOT NULL,
	"baggage_capacity" integer NOT NULL,
	"description" text,
	"image_url" text,
	CONSTRAINT "vehicles_class_unique" UNIQUE("class")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
	"stripe_event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"processing_error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "zone_pricing" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_zone_id" integer NOT NULL,
	"to_zone_id" integer NOT NULL,
	"price_pence" integer NOT NULL,
	"vehicle_type" text DEFAULT 'standard' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"boundary" jsonb,
	"center_lat" double precision,
	"center_lon" double precision,
	CONSTRAINT "zones_name_unique" UNIQUE("name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_zone_id_zones_id_fk" FOREIGN KEY ("pickup_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_dropoff_zone_id_zones_id_fk" FOREIGN KEY ("dropoff_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_fixed_route_id_fixed_routes_id_fk" FOREIGN KEY ("fixed_route_id") REFERENCES "public"."fixed_routes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "disputes" ADD CONSTRAINT "disputes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_assignments" ADD CONSTRAINT "driver_assignments_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_heartbeats" ADD CONSTRAINT "driver_heartbeats_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_heartbeats" ADD CONSTRAINT "driver_heartbeats_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_location_points" ADD CONSTRAINT "driver_location_points_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_location_points" ADD CONSTRAINT "driver_location_points_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_presence" ADD CONSTRAINT "driver_presence_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "zone_pricing" ADD CONSTRAINT "zone_pricing_from_zone_id_zones_id_fk" FOREIGN KEY ("from_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "zone_pricing" ADD CONSTRAINT "zone_pricing_to_zone_id_zones_id_fk" FOREIGN KEY ("to_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_customer_id" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_status" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_scheduled_at" ON "bookings" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_status_sched" ON "bookings" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_payment_status" ON "bookings" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_pay_status_sched" ON "bookings" USING btree ("payment_status","scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_disputes_booking" ON "disputes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_disputes_status" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_da_booking" ON "driver_assignments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_da_driver_active" ON "driver_assignments" USING btree ("driver_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_da_booking_active" ON "driver_assignments" USING btree ("booking_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "driver_heartbeats_booking_driver_unique" ON "driver_heartbeats" USING btree ("booking_id","driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hb_last" ON "driver_heartbeats" USING btree ("last_heartbeat_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dlp_booking_recorded" ON "driver_location_points" USING btree ("booking_id","recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_driver_presence_live" ON "driver_presence" USING btree ("is_on_duty","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_incidents_booking_id" ON "incidents" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_subs_user_id" ON "notification_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_booking" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_customer" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_status" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_charge" ON "payments" USING btree ("stripe_charge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refunds_booking" ON "refunds" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refunds_status" ON "refunds" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_booking_customer_unique" ON "reviews" USING btree ("booking_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviews_driver_id" ON "reviews" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_magic_link_token" ON "users" USING btree ("magic_link_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_reset_password_token" ON "users" USING btree ("reset_password_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_invitation_token" ON "users" USING btree ("invitation_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_events_type" ON "webhook_events" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "zone_pricing_unique" ON "zone_pricing" USING btree ("from_zone_id","to_zone_id","vehicle_type");