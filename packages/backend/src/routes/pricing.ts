import { Hono } from "hono";
import { pricingQuoteSchema } from "shared/validation";
import { getPricingQuote } from "../services/pricing";
import { ok, err } from "../lib/response";

export const pricingRoutes = new Hono();

pricingRoutes.get("/quote", async (c) => {
  const parsed = pricingQuoteSchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
  });

  if (!parsed.success) {
    return err(c, "Missing 'from' and 'to' query parameters", 400);
  }

  const quote = await getPricingQuote(parsed.data.from, parsed.data.to);

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
