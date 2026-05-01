import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIG_PATH = join(import.meta.dir, "../../drizzle/0001_aromatic_mordo.sql");

describe("migration 0001 — index coverage", () => {
  const sql = readFileSync(MIG_PATH, "utf8");

  test("creates the customer-id booking index", () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "idx_bookings_customer_id"');
  });

  test("creates the status+scheduled_at composite", () => {
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_bookings_status_sched" ON "bookings" USING btree ("status","scheduled_at")',
    );
  });

  test("creates the auth-token indexes", () => {
    expect(sql).toContain('"idx_users_magic_link_token"');
    expect(sql).toContain('"idx_users_reset_password_token"');
    expect(sql).toContain('"idx_users_invitation_token"');
  });

  test("creates the LOWER(email) functional index", () => {
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_users_email_lower" ON "users" USING btree (LOWER("email"))',
    );
  });

  test("creates the driver-assignment composites", () => {
    expect(sql).toContain('"idx_da_driver_active"');
    expect(sql).toContain('"idx_da_booking_active"');
  });

  test("uses IF NOT EXISTS so re-running migration is safe", () => {
    const lines = sql.split("\n").filter((l) => l.startsWith("CREATE INDEX"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain("IF NOT EXISTS");
    }
  });
});
