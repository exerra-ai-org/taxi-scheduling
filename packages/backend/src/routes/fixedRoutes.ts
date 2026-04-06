import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import {
  createFixedRouteSchema,
  updateFixedRouteSchema,
} from "shared/validation";
import { db } from "../db/index";
import { fixedRoutes } from "../db/schema";
import { authMiddleware, requireRole } from "../middleware/auth";
import { ok, err } from "../lib/response";

export const fixedRouteRoutes = new Hono();

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

// Public quick-route list for customer booking UX
fixedRouteRoutes.get("/", async (c) => {
  const routes = await db
    .select()
    .from(fixedRoutes)
    .orderBy(asc(fixedRoutes.name), asc(fixedRoutes.id));

  return ok(c, { routes });
});

fixedRouteRoutes.get("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) return err(c, "Invalid fixed route ID", 400);

  const result = await db
    .select()
    .from(fixedRoutes)
    .where(eq(fixedRoutes.id, id))
    .limit(1);

  if (result.length === 0) {
    return err(c, "Fixed route not found", 404);
  }

  return ok(c, { route: result[0] });
});

// Admin management
fixedRouteRoutes.post("/", authMiddleware, requireRole("admin"), async (c) => {
  const body = await c.req.json();
  const parsed = createFixedRouteSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const [route] = await db
    .insert(fixedRoutes)
    .values({
      name: parsed.data.name.trim(),
      fromLabel: parsed.data.fromLabel.trim(),
      toLabel: parsed.data.toLabel.trim(),
      pricePence: parsed.data.pricePence,
      isAirport: parsed.data.isAirport ?? false,
    })
    .returning();

  return ok(c, { route }, 201);
});

fixedRouteRoutes.patch(
  "/:id",
  authMiddleware,
  requireRole("admin"),
  async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return err(c, "Invalid fixed route ID", 400);

    const body = await c.req.json();
    const parsed = updateFixedRouteSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, "Invalid input", 400, parsed.error.flatten());
    }

    const updates: Partial<{
      name: string;
      fromLabel: string;
      toLabel: string;
      pricePence: number;
      isAirport: boolean;
    }> = {};

    if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
    if (parsed.data.fromLabel !== undefined)
      updates.fromLabel = parsed.data.fromLabel.trim();
    if (parsed.data.toLabel !== undefined)
      updates.toLabel = parsed.data.toLabel.trim();
    if (parsed.data.pricePence !== undefined)
      updates.pricePence = parsed.data.pricePence;
    if (parsed.data.isAirport !== undefined)
      updates.isAirport = parsed.data.isAirport;

    if (Object.keys(updates).length === 0) {
      return err(c, "No fields provided to update", 400);
    }

    const [route] = await db
      .update(fixedRoutes)
      .set(updates)
      .where(eq(fixedRoutes.id, id))
      .returning();

    if (!route) {
      return err(c, "Fixed route not found", 404);
    }

    return ok(c, { route });
  },
);

fixedRouteRoutes.delete(
  "/:id",
  authMiddleware,
  requireRole("admin"),
  async (c) => {
    const id = parseId(c.req.param("id"));
    if (!id) return err(c, "Invalid fixed route ID", 400);

    const [route] = await db
      .delete(fixedRoutes)
      .where(eq(fixedRoutes.id, id))
      .returning();

    if (!route) {
      return err(c, "Fixed route not found", 404);
    }

    return ok(c, { route });
  },
);
