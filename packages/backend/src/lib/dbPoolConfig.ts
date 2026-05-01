/**
 * Postgres connection pool tuning.
 *
 * postgres-js defaults to max=10, idle_timeout=0 (never close), and a
 * connect timeout of forever. Under load the watchdog + ride reminder
 * jobs + per-request queries can saturate the pool while idle clients
 * pile up. These defaults are reasonable for a single-node deployment;
 * tune via env in larger fleets.
 *
 * connect_timeout=30s is a safety margin for cross-region or shared-host
 * Postgres (alwaysdata, low-tier RDS) where TLS + auth can spike past
 * 5-10s under contention. Override via DB_CONNECT_TIMEOUT_SECONDS.
 */

const POOL_MAX_DEFAULT = 20;
const POOL_MAX_CEILING = 200;
const IDLE_TIMEOUT_DEFAULT = 20; // seconds
const CONNECT_TIMEOUT_DEFAULT = 30; // seconds

export interface DbPoolConfig {
  max: number;
  idleTimeoutSeconds: number;
  connectTimeoutSeconds: number;
}

export function readDbPoolConfig(
  env: Record<string, string | undefined>,
): DbPoolConfig {
  return {
    max: clamp(
      parsePositiveInt(env.DB_POOL_MAX, POOL_MAX_DEFAULT),
      1,
      POOL_MAX_CEILING,
    ),
    idleTimeoutSeconds: parsePositiveInt(
      env.DB_IDLE_TIMEOUT_SECONDS,
      IDLE_TIMEOUT_DEFAULT,
    ),
    connectTimeoutSeconds: parsePositiveInt(
      env.DB_CONNECT_TIMEOUT_SECONDS,
      CONNECT_TIMEOUT_DEFAULT,
    ),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
