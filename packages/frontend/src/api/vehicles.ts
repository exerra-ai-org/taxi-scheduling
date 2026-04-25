import { api } from "./client";
import type { Vehicle } from "shared/types";

export function listVehicles() {
  return api.get<{ vehicles: Vehicle[] }>("/api/vehicles");
}
