import { Hono } from "hono";
import { z } from "zod";
import { ok, err } from "../lib/response";
import { authMiddleware, requireRole } from "../middleware/auth";
import {
  getAllSettings,
  getPublicSettings,
  setSetting,
  isAdminSettingKey,
} from "../services/appSettings";

export const settingsRoutes = new Hono();

// Public — needed by the customer app to dial admin / emergency.
settingsRoutes.get("/public", async (c) => {
  return ok(c, await getPublicSettings());
});

// Admin — read all.
settingsRoutes.get("/", authMiddleware, requireRole("admin"), async (c) => {
  return ok(c, await getAllSettings());
});

const updateSchema = z.object({
  updates: z.record(z.string(), z.string()),
});

// Admin — write any subset.
settingsRoutes.put("/", authMiddleware, requireRole("admin"), async (c) => {
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return err(c, "Invalid input", 400, parsed.error.flatten());

  for (const [key, value] of Object.entries(parsed.data.updates)) {
    if (!isAdminSettingKey(key)) {
      return err(c, `Unknown setting key: ${key}`, 400);
    }
    await setSetting(key, value);
  }

  return ok(c, await getAllSettings());
});
