import { test, expect, describe } from "bun:test";
import { validateRuntimeConfig } from "../../src/lib/configValidation";

const STRONG_SECRET = "x".repeat(40);

describe("validateRuntimeConfig — production", () => {
  test("throws when JWT_SECRET is missing", () => {
    expect(() =>
      validateRuntimeConfig({
        nodeEnv: "production",
        jwtSecret: undefined,
        databaseUrl: "postgresql://x",
      }),
    ).toThrow(/JWT_SECRET/);
  });

  test("throws when JWT_SECRET is empty", () => {
    expect(() =>
      validateRuntimeConfig({
        nodeEnv: "production",
        jwtSecret: "",
        databaseUrl: "postgresql://x",
      }),
    ).toThrow(/JWT_SECRET/);
  });

  test("throws on the documented dev default", () => {
    expect(() =>
      validateRuntimeConfig({
        nodeEnv: "production",
        jwtSecret: "dev-secret-change-me",
        databaseUrl: "postgresql://x",
      }),
    ).toThrow(/default/i);
  });

  test("throws on the .env.example default", () => {
    expect(() =>
      validateRuntimeConfig({
        nodeEnv: "production",
        jwtSecret: "change-me-in-production",
        databaseUrl: "postgresql://x",
      }),
    ).toThrow(/default/i);
  });

  test("throws when JWT_SECRET is shorter than 32 chars", () => {
    expect(() =>
      validateRuntimeConfig({
        nodeEnv: "production",
        jwtSecret: "x".repeat(31),
        databaseUrl: "postgresql://x",
      }),
    ).toThrow(/32/);
  });

  test("throws when DATABASE_URL is missing", () => {
    expect(() =>
      validateRuntimeConfig({
        nodeEnv: "production",
        jwtSecret: STRONG_SECRET,
        databaseUrl: undefined,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  test("passes with a strong secret and a database URL", () => {
    expect(() =>
      validateRuntimeConfig({
        nodeEnv: "production",
        jwtSecret: STRONG_SECRET,
        databaseUrl: "postgresql://localhost/db",
      }),
    ).not.toThrow();
  });
});

describe("validateRuntimeConfig — development", () => {
  test("does not throw on weak/missing secret in dev", () => {
    expect(() =>
      validateRuntimeConfig({
        nodeEnv: "development",
        jwtSecret: undefined,
        databaseUrl: undefined,
      }),
    ).not.toThrow();
  });

  test("does not throw on dev default in dev", () => {
    expect(() =>
      validateRuntimeConfig({
        nodeEnv: "development",
        jwtSecret: "dev-secret-change-me",
        databaseUrl: "postgresql://x",
      }),
    ).not.toThrow();
  });
});
