import { api } from "./client";
import type { Vehicle, MileRate } from "shared/types";

export function listVehicles() {
  return api.get<{ vehicles: Vehicle[] }>("/vehicles");
}

export function listMileRates() {
  return api.get<{ rates: MileRate[] }>("/vehicles/rates");
}

export function updateVehicle(
  vehicleClass: string,
  data: { passengerCapacity?: number; baggageCapacity?: number },
) {
  return api.patch<{ vehicle: Vehicle }>(`/vehicles/${vehicleClass}`, data);
}

export function updateMileRate(
  vehicleClass: string,
  data: { baseFarePence?: number; ratePerMilePence?: number },
) {
  return api.patch<{ rate: MileRate }>(`/vehicles/${vehicleClass}/rates`, data);
}
