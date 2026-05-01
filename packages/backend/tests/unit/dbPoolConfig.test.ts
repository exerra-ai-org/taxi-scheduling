import { test, expect, describe } from "bun:test";
import { readDbPoolConfig } from "../../src/lib/dbPoolConfig";

describe("readDbPoolConfig", () => {
  test("returns sensible defaults when no env is set", () => {
    const cfg = readDbPoolConfig({});
    expect(cfg.max).toBe(20);
    expect(cfg.idleTimeoutSeconds).toBe(20);
    expect(cfg.connectTimeoutSeconds).toBe(30);
  });

  test("DB_POOL_MAX overrides max", () => {
    expect(readDbPoolConfig({ DB_POOL_MAX: "50" }).max).toBe(50);
  });

  test("invalid DB_POOL_MAX falls back to default", () => {
    expect(readDbPoolConfig({ DB_POOL_MAX: "not-a-number" }).max).toBe(20);
    expect(readDbPoolConfig({ DB_POOL_MAX: "0" }).max).toBe(20);
    expect(readDbPoolConfig({ DB_POOL_MAX: "-5" }).max).toBe(20);
  });

  test("DB_IDLE_TIMEOUT_SECONDS overrides idle timeout", () => {
    expect(
      readDbPoolConfig({ DB_IDLE_TIMEOUT_SECONDS: "60" }).idleTimeoutSeconds,
    ).toBe(60);
  });

  test("DB_CONNECT_TIMEOUT_SECONDS overrides connect timeout", () => {
    expect(
      readDbPoolConfig({ DB_CONNECT_TIMEOUT_SECONDS: "30" })
        .connectTimeoutSeconds,
    ).toBe(30);
  });

  test("clamps absurdly high pool size to a safe ceiling", () => {
    // Postgres default max_connections is 100; one client should not
    // monopolise the cluster.
    const cfg = readDbPoolConfig({ DB_POOL_MAX: "999999" });
    expect(cfg.max).toBeLessThanOrEqual(200);
  });
});
