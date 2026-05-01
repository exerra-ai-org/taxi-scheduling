import { describe, test, expect } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  users,
  bookings,
  driverAssignments,
  driverHeartbeats,
  reviews,
  notificationSubscriptions,
  incidents,
} from "../../src/db/schema";

function indexNames(table: any): string[] {
  return getTableConfig(table).indexes.map((idx: any) => idx.config.name);
}

describe("schema indexes — declared in source", () => {
  test("users has indexes for token lookups, role, lower-email", () => {
    const names = indexNames(users);
    expect(names).toContain("idx_users_role");
    expect(names).toContain("idx_users_magic_link_token");
    expect(names).toContain("idx_users_reset_password_token");
    expect(names).toContain("idx_users_invitation_token");
    expect(names).toContain("idx_users_email_lower");
  });

  test("bookings has indexes on customer_id, status, scheduled_at + composite", () => {
    const names = indexNames(bookings);
    expect(names).toContain("idx_bookings_customer_id");
    expect(names).toContain("idx_bookings_status");
    expect(names).toContain("idx_bookings_scheduled_at");
    expect(names).toContain("idx_bookings_status_sched");
  });

  test("driver_assignments has indexes for booking + active-driver lookups", () => {
    const names = indexNames(driverAssignments);
    expect(names).toContain("idx_da_booking");
    expect(names).toContain("idx_da_driver_active");
    expect(names).toContain("idx_da_booking_active");
  });

  test("driver_heartbeats has index on last_heartbeat_at", () => {
    const names = indexNames(driverHeartbeats);
    expect(names).toContain("idx_hb_last");
  });

  test("reviews has index on driver_id (rating aggregations)", () => {
    const names = indexNames(reviews);
    expect(names).toContain("idx_reviews_driver_id");
  });

  test("notification_subscriptions has index on user_id", () => {
    const names = indexNames(notificationSubscriptions);
    expect(names).toContain("idx_notif_subs_user_id");
  });

  test("incidents has index on booking_id", () => {
    const names = indexNames(incidents);
    expect(names).toContain("idx_incidents_booking_id");
  });
});
