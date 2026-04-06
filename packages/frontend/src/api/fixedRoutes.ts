import { api } from "./client";
import type { FixedRoute } from "shared/types";

export async function listQuickRoutes() {
  return api.get<{ routes: FixedRoute[] }>("/api/fixed-routes");
}
