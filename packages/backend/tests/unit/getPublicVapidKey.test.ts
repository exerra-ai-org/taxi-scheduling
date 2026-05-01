import { test, expect, describe, beforeAll } from "bun:test";

// VAPID keys must be a valid uncompressed P-256 point (65 raw bytes,
// base64url-encoded → 87 chars). Generated once for the test only.
const TEST_VAPID_PUBLIC =
  "BO0pT8Mq3QkhqL3sZc-Ckdx5OS9VnTvqFx2yNjs-9PDr_RGGpOZGhT60TtnxLhx2gqPmYFpeKCD3MBqf0H8VXfA";
const TEST_VAPID_PRIVATE = "JmcvE5dXm_gC0c3lMoQH3CzcW1AeLY2Q5dM7hO9zX5o";

describe("getPublicVapidKey", () => {
  beforeAll(() => {
    process.env.VAPID_PUBLIC_KEY = TEST_VAPID_PUBLIC;
    process.env.VAPID_PRIVATE_KEY = TEST_VAPID_PRIVATE;
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    // Quiet startup warnings for unrelated config.
    process.env.JWT_SECRET ??= "x".repeat(40);
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/taxi";
  });

  test("does not throw ReferenceError and returns the configured public key", async () => {
    // Import after env is set.
    const mod = await import("../../src/services/notifications");
    expect(() => mod.getPublicVapidKey()).not.toThrow();
    expect(mod.getPublicVapidKey()).toBe(TEST_VAPID_PUBLIC);
  });
});
