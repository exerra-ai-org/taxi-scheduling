import { sql } from "drizzle-orm";
import type { db as Db } from "../db/index";

/**
 * Run `fn` only if a Postgres transaction-scoped advisory lock is acquired.
 *
 * In multi-replica deployments every backend runs background jobs and
 * races on shared state (driver fallback flips, notification dedupe).
 * pg_try_advisory_xact_lock is a non-blocking cluster-wide mutex keyed
 * by an integer; only the connection that acquired it holds it, and
 * Postgres auto-releases the lock at commit/rollback.
 *
 * Why xact-scoped instead of session-scoped: postgres-js uses a
 * connection pool. A `pg_try_advisory_lock` + later `pg_advisory_unlock`
 * may land on different pooled connections, producing the warning
 *   "you don't own a lock of type ExclusiveLock"
 * and leaking the lock until the original connection is recycled.
 * Wrapping in a transaction pins both the lock acquire and the implicit
 * release to the same connection.
 *
 * Note: the lock holder is the txn's connection. The body of `fn` may
 * use the global `db` pool — concurrency safety comes from other
 * replicas seeing the lock as held and skipping, not from isolating
 * the inner queries.
 *
 * Returns:
 *   { ran: false }                  if the lock was not acquired
 *   { ran: true, value: T }         if fn ran
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
  return await database.transaction(async (tx) => {
    const rows = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${lockId}) AS locked`,
    )) as Array<{ locked: boolean }>;
    const acquired = rows?.[0]?.locked === true;

    if (!acquired) {
      return { ran: false };
    }

    const value = await fn();
    return { ran: true, value };
  });
}
