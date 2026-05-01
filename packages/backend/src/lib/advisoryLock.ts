import { sql } from "drizzle-orm";
import type { db as Db } from "../db/index";

/**
 * Run `fn` only if a Postgres session-scoped advisory lock is acquired.
 *
 * In multi-replica deployments every backend runs background jobs and
 * races on shared state (driver fallback flips, notification dedupe).
 * pg_try_advisory_lock is a non-blocking cluster-wide mutex keyed by
 * an integer; only one process holds the lock at a time. Other
 * processes see `acquired=false` and skip the work.
 *
 * Returns:
 *   { ran: false }                  if the lock was not acquired
 *   { ran: true, value: T }         if fn ran (whether it returned a value or not)
 *
 * The lock is released in a `finally`, even when fn throws.
 */
export interface LockResult<T> {
  ran: boolean;
  value?: T;
}

export async function withAdvisoryLock<T>(
  database: typeof Db,
  lockId: number,
  fn: () => Promise<T>,
): Promise<LockResult<T>> {
  const tryRows = (await database.execute(
    sql`SELECT pg_try_advisory_lock(${lockId}) AS locked`,
  )) as Array<{ locked: boolean }>;
  const acquired = tryRows?.[0]?.locked === true;

  if (!acquired) {
    return { ran: false };
  }

  try {
    const value = await fn();
    return { ran: true, value };
  } finally {
    await database.execute(sql`SELECT pg_advisory_unlock(${lockId})`);
  }
}
