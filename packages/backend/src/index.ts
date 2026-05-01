import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { join } from "path";
import { config } from "./config";
import { logger } from "./lib/logger";
import { requestContext } from "./middleware/requestContext";
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
import { eventsRoutes } from "./routes/events";
import { startBackgroundJobs } from "./services/jobs";
import { resolveSafeUploadPath } from "./lib/safeUploadPath";

const app = new Hono();

app.use("*", requestContext());

// Lightweight per-request access log. Tied to the request-scoped logger so
// all entries carry the same x-request-id for correlation.
app.use("*", async (c, next) => {
  const log = c.get("logger");
  const start = performance.now();
  await next();
  const ms = Math.round(performance.now() - start);
  log.info("request", { status: c.res.status, durationMs: ms });
});

app.use(
  "*",
  secureHeaders({
    // Frontend assets are served separately (Vite/CDN); a tight CSP for
    // the JSON API is fine.
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity: config.isProduction
      ? "max-age=63072000; includeSubDomains; preload"
      : false,
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
  }),
);

// Default body limit. Upload routes opt into a larger ceiling.
app.use(
  "*",
  bodyLimit({
    maxSize: 1 * 1024 * 1024, // 1 MB
    onError: (c) =>
      c.json({ success: false, error: "Request body too large" }, 413),
  }),
);

app.use(
  "/*",
  cors({
    origin: config.cors.origins,
    credentials: true,
  }),
);

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.route("/auth", authRoutes);
app.route("/pricing", pricingRoutes);
app.route("/bookings", bookingRoutes);
app.route("/drivers", driverRoutes);
app.route("/coupons", couponRoutes);
app.route("/reviews", reviewRoutes);
app.route("/zones", zoneRoutes);
app.route("/fixed-routes", fixedRouteRoutes);
app.route("/notifications", notificationRoutes);
app.route("/vehicles", vehicleRoutes);
app.route("/admin", adminRoutes);
app.use(
  "/upload/*",
  bodyLimit({
    maxSize: 6 * 1024 * 1024, // 6 MB
    onError: (c) =>
      c.json({ success: false, error: "Upload too large" }, 413),
  }),
);
app.route("/upload", uploadRoutes);
app.route("/events", eventsRoutes);

// Serve uploaded files
const UPLOAD_DIR = join(import.meta.dir, "../uploads");

app.get("/uploads/:filename", async (c) => {
  const safePath = resolveSafeUploadPath(UPLOAD_DIR, c.req.param("filename"));
  if (!safePath) {
    return c.text("Not found", 404);
  }

  const file = Bun.file(safePath);
  if (!(await file.exists())) {
    return c.text("Not found", 404);
  }

  return new Response(file, {
    headers: {
      "Content-Type": file.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

app.notFound((c) => c.json({ success: false, error: "Not found" }, 404));

app.onError((cause, c) => {
  // Log full detail server-side; never leak the stack to clients.
  const log = c.get("logger") ?? logger;
  log.error("unhandled exception", { err: cause as Error });
  return c.json({ success: false, error: "Internal server error" }, 500);
});

startBackgroundJobs();

// Startup diagnostics — make missing config visible immediately.
logger.info("server startup", {
  email: config.email.resendApiKey ? "resend" : "unconfigured",
  push: config.push.publicKey ? "vapid" : "unconfigured",
  corsOrigins: config.cors.origins,
  port: config.server.port,
});

export default {
  port: config.server.port,
  fetch: app.fetch,
};
