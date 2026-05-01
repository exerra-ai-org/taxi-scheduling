import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { config } from "../config";

// `bun --hot` re-imports modules on every save without disposing the
// previous pool, leaking connections until the cloud DB caps out (you
// see this as intermittent CONNECT_TIMEOUT during development). Pin
// the pool to globalThis in non-production so re-imports reuse it.
const globalForDb = globalThis as unknown as {
  __dbClient?: ReturnType<typeof postgres>;
  __db?: ReturnType<typeof drizzle<typeof schema>>;
};

function createClient() {
  return postgres(config.database.url, {
    ssl: { rejectUnauthorized: false },
    max: config.database.pool.max,
    idle_timeout: config.database.pool.idleTimeoutSeconds,
    connect_timeout: config.database.pool.connectTimeoutSeconds,
  });
}

export const dbClient = config.isProduction
  ? createClient()
  : (globalForDb.__dbClient ??= createClient());

export const db = config.isProduction
  ? drizzle(dbClient, { schema })
  : (globalForDb.__db ??= drizzle(dbClient, { schema }));
