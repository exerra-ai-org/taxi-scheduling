import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { vehicles, mileRates, vehicleClassEnum } from "../db/schema";
import { ok, err } from "../lib/response";
import { authMiddleware, requireRole } from "../middleware/auth";
import { updateVehicleSchema, updateMileRateSchema } from "shared/validation";

export const vehicleRoutes = new Hono();

const VALID_CLASSES = vehicleClassEnum.enumValues;

function isValidClass(c: string): c is (typeof VALID_CLASSES)[number] {
  return VALID_CLASSES.includes(c as (typeof VALID_CLASSES)[number]);
}

vehicleRoutes.get("/", async (c) => {
  try {
    const result = await db.select().from(vehicles);
    return ok(c, { vehicles: result });
  } catch (error) {
    console.error("Failed to fetch vehicles:", error);
    return err(c, "Failed to fetch vehicles", 500);
  }
});

vehicleRoutes.get("/rates", async (c) => {
  try {
    const result = await db.select().from(mileRates);
    return ok(c, { rates: result });
  } catch (error) {
    console.error("Failed to fetch mile rates:", error);
    return err(c, "Failed to fetch mile rates", 500);
  }
});

vehicleRoutes.patch(
  "/:class",
  authMiddleware,
  requireRole("admin"),
  async (c) => {
    const vehicleClass = c.req.param("class");
    if (!isValidClass(vehicleClass)) {
      return err(c, "Invalid vehicle class", 400);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return err(c, "Invalid JSON", 400);
    }

    const parsed = updateVehicleSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, "Invalid input", 400, parsed.error.flatten());
    }

    const { passengerCapacity, baggageCapacity } = parsed.data;
    if (passengerCapacity === undefined && baggageCapacity === undefined) {
      return err(c, "No fields to update", 400);
    }

    const updates: Record<string, number> = {};
    if (passengerCapacity !== undefined) updates.passengerCapacity = passengerCapacity;
    if (baggageCapacity !== undefined) updates.baggageCapacity = baggageCapacity;

    try {
      const result = await db
        .update(vehicles)
        .set(updates)
        .where(eq(vehicles.class, vehicleClass))
        .returning();

      if (result.length === 0) return err(c, "Vehicle class not found", 404);
      return ok(c, { vehicle: result[0] });
    } catch (error) {
      console.error("Failed to update vehicle:", error);
      return err(c, "Failed to update vehicle", 500);
    }
  },
);

vehicleRoutes.patch(
  "/:class/rates",
  authMiddleware,
  requireRole("admin"),
  async (c) => {
    const vehicleClass = c.req.param("class");
    if (!isValidClass(vehicleClass)) {
      return err(c, "Invalid vehicle class", 400);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return err(c, "Invalid JSON", 400);
    }

    const parsed = updateMileRateSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, "Invalid input", 400, parsed.error.flatten());
    }

    const { baseFarePence, ratePerMilePence } = parsed.data;
    if (baseFarePence === undefined && ratePerMilePence === undefined) {
      return err(c, "No fields to update", 400);
    }

    const updates: Record<string, number> = {};
    if (baseFarePence !== undefined) updates.baseFarePence = baseFarePence;
    if (ratePerMilePence !== undefined) updates.ratePerMilePence = ratePerMilePence;

    try {
      const result = await db
        .update(mileRates)
        .set(updates)
        .where(eq(mileRates.vehicleClass, vehicleClass))
        .returning();

      if (result.length === 0) return err(c, "Rate not found for this class", 404);
      return ok(c, { rate: result[0] });
    } catch (error) {
      console.error("Failed to update mile rate:", error);
      return err(c, "Failed to update mile rate", 500);
    }
  },
);
