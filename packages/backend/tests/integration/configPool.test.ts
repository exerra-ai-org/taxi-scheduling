import { test, expect, describe } from "bun:test";
import { join } from "node:path";

// config.ts caches at first import, so env-var overrides only take effect
// in a fresh process. We spawn a subprocess for each scenario.
async function readPoolWithEnv(env: Record<string, string>): Promise<{
  max: number;
  idleTimeoutSeconds: number;
  connectTimeoutSeconds: number;
}> {
  const script = `
    const { config } = await import("${join(import.meta.dir, "../../src/config")}");
    process.stdout.write(JSON.stringify(config.database.pool));
  `;
  const proc = Bun.spawn({
    cmd: ["bun", "-e", script],
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://test:test@localhost:5432/taxi",
      JWT_SECRET: "x".repeat(40),
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(text);
}

describe("config.database.pool reflects env vars", () => {
  test("max comes from DB_POOL_MAX", async () => {
    const pool = await readPoolWithEnv({ DB_POOL_MAX: "42" });
    expect(pool.max).toBe(42);
  });
  test("idle timeout comes from DB_IDLE_TIMEOUT_SECONDS", async () => {
    const pool = await readPoolWithEnv({ DB_IDLE_TIMEOUT_SECONDS: "33" });
    expect(pool.idleTimeoutSeconds).toBe(33);
  });
  test("connect timeout comes from DB_CONNECT_TIMEOUT_SECONDS", async () => {
    const pool = await readPoolWithEnv({ DB_CONNECT_TIMEOUT_SECONDS: "11" });
    expect(pool.connectTimeoutSeconds).toBe(11);
  });
  test("defaults apply when env is empty", async () => {
    const pool = await readPoolWithEnv({});
    expect(pool.max).toBe(20);
    expect(pool.idleTimeoutSeconds).toBe(20);
    expect(pool.connectTimeoutSeconds).toBe(30);
  });
});
