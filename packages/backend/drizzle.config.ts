import { defineConfig } from "drizzle-kit";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/taxi";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: { rejectUnauthorized: false },
  },
});
