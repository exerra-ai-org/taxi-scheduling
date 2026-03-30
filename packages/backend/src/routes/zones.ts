import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { zones } from "../db/schema";
import { ok, err } from "../lib/response";

export const zoneRoutes = new Hono();

// Public — no auth required
zoneRoutes.get("/", async (c) => {
  const results = await db.select().from(zones);
  return ok(c, { zones: results });
});

zoneRoutes.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const result = await db.select().from(zones).where(eq(zones.id, id)).limit(1);
  if (result.length === 0) {
    return err(c, "Zone not found", 404);
  }
  return ok(c, { zone: result[0] });
});
