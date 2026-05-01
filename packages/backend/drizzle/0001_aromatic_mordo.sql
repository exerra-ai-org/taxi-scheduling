CREATE INDEX IF NOT EXISTS "idx_bookings_customer_id" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_status" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_scheduled_at" ON "bookings" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookings_status_sched" ON "bookings" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_da_booking" ON "driver_assignments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_da_driver_active" ON "driver_assignments" USING btree ("driver_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_da_booking_active" ON "driver_assignments" USING btree ("booking_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hb_last" ON "driver_heartbeats" USING btree ("last_heartbeat_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_incidents_booking_id" ON "incidents" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_subs_user_id" ON "notification_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reviews_driver_id" ON "reviews" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_magic_link_token" ON "users" USING btree ("magic_link_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_reset_password_token" ON "users" USING btree ("reset_password_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_invitation_token" ON "users" USING btree ("invitation_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email_lower" ON "users" USING btree (LOWER("email"));