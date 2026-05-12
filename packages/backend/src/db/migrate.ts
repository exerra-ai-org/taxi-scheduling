// Safe forward-only migration runner.
//
// Drizzle's `db:push` rewrites schema from a snapshot diff, which can drop
// columns when the snapshot drifts from reality. This runner instead applies
// hand-written, idempotent SQL files from `src/db/migrations/` in filename
// order and records each application in `_app_migrations` so re-running is a
// no-op. The Drizzle journal is left untouched — schema.ts is updated only
// to keep ORM types in sync with what these SQL files install.
//
// Usage:
//   bun run db:migrate                  # apply all pending migrations
//   bun run db:migrate --dry-run        # show what would run, don't apply

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { config } from "../config";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

async function listSqlFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const sql = postgres(config.database.url, {
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  // Postgres advisory lock key. Arbitrary 64-bit int — any value works as
  // long as no other code in this DB uses the same one. `pg_advisory_lock`
  // blocks until the lock is held; concurrent container starts queue up
  // here so exactly one runner applies migrations at a time.
  const LOCK_KEY = 84724_19283; // "app-migrate" mnemonic
  let lockAcquired = false;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "_app_migrations" (
        "name" text PRIMARY KEY,
        "applied_at" timestamp NOT NULL DEFAULT now()
      )
    `;

    console.log("[migrate] acquiring advisory lock...");
    await sql`SELECT pg_advisory_lock(${LOCK_KEY})`;
    lockAcquired = true;

    const files = await listSqlFiles();
    const appliedRows = await sql<
      { name: string }[]
    >`SELECT name FROM "_app_migrations"`;
    const applied = new Set(appliedRows.map((r) => r.name));

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log("[migrate] up to date — no pending migrations");
      return;
    }

    console.log(`[migrate] ${pending.length} pending migration(s):`);
    for (const file of pending) console.log(`  - ${file}`);

    if (dryRun) {
      console.log("[migrate] --dry-run set; not applying");
      return;
    }

    for (const file of pending) {
      const path = join(MIGRATIONS_DIR, file);
      const body = await readFile(path, "utf8");
      console.log(`[migrate] applying ${file}...`);
      // Each SQL file owns its own transaction boundary via BEGIN/COMMIT.
      // We do NOT wrap here because some statements (e.g. CREATE TYPE in
      // certain pg versions) misbehave inside nested transactions.
      await sql.unsafe(body);
      await sql`INSERT INTO "_app_migrations" ("name") VALUES (${file})`;
      console.log(`[migrate] ✓ ${file}`);
    }

    console.log("[migrate] done");
  } finally {
    if (lockAcquired) {
      try {
        await sql`SELECT pg_advisory_unlock(${LOCK_KEY})`;
      } catch {
        // Best-effort — the lock auto-releases on session end anyway.
      }
    }
    await sql.end({ timeout: 5 });
  }
}

run().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
