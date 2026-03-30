import { Hono } from "hono";
import { pricingQuoteSchema } from "shared/validation";
import { getPricingQuote } from "../services/pricing";
import { ok, err } from "../lib/response";

export const pricingRoutes = new Hono();

pricingRoutes.get("/quote", async (c) => {
  const parsed = pricingQuoteSchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
    fromLat: c.req.query("fromLat"),
    fromLon: c.req.query("fromLon"),
    toLat: c.req.query("toLat"),
    toLon: c.req.query("toLon"),
  });

  if (!parsed.success) {
    return err(c, "Missing 'from' and 'to' query parameters", 400);
  }

  const { from, to, fromLat, fromLon, toLat, toLon } = parsed.data;

  const quote = await getPricingQuote(from, to, {
    fromLat,
    fromLon,
    toLat,
    toLon,
  });

  if (!quote) {
    return err(c, "No pricing found for this route", 404);
  }

  return ok(c, {
    pricePence: quote.pricePence,
    routeType: quote.routeType,
    routeName: quote.routeName,
    isAirport: quote.isAirport,
  });
});
