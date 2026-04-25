import { api } from "./client";
import type {
  PricingQuote,
  PricingQuoteMulti,
  VehicleClass,
} from "shared/types";

export interface QuoteParams {
  from: string;
  to: string;
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;
  vehicleClass?: VehicleClass;
}

function buildQuery(params: QuoteParams): string {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.fromLat != null) q.set("fromLat", String(params.fromLat));
  if (params.fromLon != null) q.set("fromLon", String(params.fromLon));
  if (params.toLat != null) q.set("toLat", String(params.toLat));
  if (params.toLon != null) q.set("toLon", String(params.toLon));
  if (params.vehicleClass) q.set("vehicleClass", params.vehicleClass);
  return q.toString();
}

export function getQuote(params: QuoteParams) {
  return api.get<PricingQuote>(`/api/pricing/quote?${buildQuery(params)}`);
}

export function getQuoteAll(params: Omit<QuoteParams, "vehicleClass">) {
  return api.get<PricingQuoteMulti>(
    `/api/pricing/quote-all?${buildQuery(params)}`,
  );
}
