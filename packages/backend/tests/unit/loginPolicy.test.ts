import { test, expect, describe } from "bun:test";
import { decideLoginAttempt } from "../../src/lib/loginPolicy";

describe("decideLoginAttempt", () => {
  test("password-less account is told to use magic link, even when phone matches", () => {
    const result = decideLoginAttempt(
      { passwordHash: null, phone: "07123456789" },
      undefined,
    );
    expect(result.kind).toBe("magic_link_required");
  });

  test("password-less account ignores any phone field (no phone-based auth)", () => {
    // Even if a phone string is sent, it must NOT be accepted as a credential.
    const result = decideLoginAttempt(
      { passwordHash: null, phone: "07123456789" },
      undefined,
    );
    expect(result.kind).toBe("magic_link_required");
  });

  test("password-having account without supplied password → password_required", () => {
    const result = decideLoginAttempt(
      { passwordHash: "$argon2id$dummy", phone: null },
      undefined,
    );
    expect(result.kind).toBe("password_required");
  });

  test("password-having account with supplied password → verify_password", () => {
    const result = decideLoginAttempt(
      { passwordHash: "$argon2id$dummy", phone: null },
      "hunter2",
    );
    expect(result.kind).toBe("verify_password");
    if (result.kind === "verify_password") {
      expect(result.passwordHash).toBe("$argon2id$dummy");
      expect(result.password).toBe("hunter2");
    }
  });

  test("verify_password is the only outcome that yields a hash to check", () => {
    const r1 = decideLoginAttempt({ passwordHash: null, phone: null }, "x");
    const r2 = decideLoginAttempt(
      { passwordHash: "h", phone: null },
      undefined,
    );
    expect(r1.kind).toBe("magic_link_required");
    expect(r2.kind).toBe("password_required");
  });
});
