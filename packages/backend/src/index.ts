import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth";
import { pricingRoutes } from "./routes/pricing";
import { bookingRoutes } from "./routes/bookings";
import { driverRoutes } from "./routes/drivers";
import { couponRoutes } from "./routes/coupons";
import { reviewRoutes } from "./routes/reviews";
import { zoneRoutes } from "./routes/zones";
import { fixedRouteRoutes } from "./routes/fixedRoutes";
import { notificationRoutes } from "./routes/notifications";
import { startBackgroundJobs } from "./services/jobs";

const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.route("/api/auth", authRoutes);
app.route("/api/pricing", pricingRoutes);
app.route("/api/bookings", bookingRoutes);
app.route("/api/drivers", driverRoutes);
app.route("/api/coupons", couponRoutes);
app.route("/api/reviews", reviewRoutes);
app.route("/api/zones", zoneRoutes);
app.route("/api/fixed-routes", fixedRouteRoutes);
app.route("/api/notifications", notificationRoutes);

startBackgroundJobs();

export default {
  port: 3000,
  fetch: app.fetch,
};
