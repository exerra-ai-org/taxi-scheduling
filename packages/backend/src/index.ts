import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { join } from "path";
import { authRoutes } from "./routes/auth";
import { pricingRoutes } from "./routes/pricing";
import { bookingRoutes } from "./routes/bookings";
import { driverRoutes } from "./routes/drivers";
import { couponRoutes } from "./routes/coupons";
import { reviewRoutes } from "./routes/reviews";
import { zoneRoutes } from "./routes/zones";
import { fixedRouteRoutes } from "./routes/fixedRoutes";
import { notificationRoutes } from "./routes/notifications";
import { vehicleRoutes } from "./routes/vehicles";
import { adminRoutes } from "./routes/admin";
import { uploadRoutes } from "./routes/upload";
import { startBackgroundJobs } from "./services/jobs";

const app = new Hono();

app.use("*", logger());
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
app.use(
  "/api/*",
  cors({
    origin: CORS_ORIGIN.split(",").map((s) => s.trim()),
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
app.route("/api/vehicles", vehicleRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/upload", uploadRoutes);

// Serve uploaded files
const UPLOAD_DIR = join(import.meta.dir, "../uploads");
app.get("/uploads/:filename", async (c) => {
  const filename = c.req.param("filename");
  // Prevent path traversal
  if (filename.includes("..") || filename.includes("/")) {
    return c.text("Not found", 404);
  }
  const file = Bun.file(join(UPLOAD_DIR, filename));
  if (!(await file.exists())) return c.text("Not found", 404);
  return new Response(file, {
    headers: {
      "Content-Type": file.type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

startBackgroundJobs();

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
