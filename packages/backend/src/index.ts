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
import { webhookRoutes } from "./routes/webhooks";
import { paymentRoutes } from "./routes/payments";
import { settingsRoutes } from "./routes/settings";
import { startBackgroundJobs, stopBackgroundJobs } from "./services/jobs";
import { resolveSafeUploadPath } from "./lib/safeUploadPath";
import { db, dbClient } from "./db/index";
import { sql } from "drizzle-orm";
import { createShutdown } from "./lib/shutdown";

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

// Stripe webhooks: mounted BEFORE the global body-limit and CORS layers.
// Signature verification needs the raw, untouched request bytes — any
// middleware that consumes or re-encodes the body breaks HMAC. CORS is
// also irrelevant here (server-to-server, no browser origin).
app.route("/webhooks", webhookRoutes);

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

// Liveness — never depends on external systems. Used by orchestrators to
// decide whether the process is alive.
app.get("/livez", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// Readiness — depends on Postgres. Returns 503 if the DB is unreachable so
// load balancers can drain this replica until it recovers.
const readinessHandler = async (c: any) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({
      status: "ok",
      db: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (cause) {
    c.get("logger")?.warn("readiness check failed", { err: cause as Error });
    return c.json(
      {
        status: "degraded",
        db: "down",
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
};
app.get("/readyz", readinessHandler);
// Backwards-compat alias.
app.get("/health", readinessHandler);

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
app.route("/payments", paymentRoutes);
app.route("/settings", settingsRoutes);
app.use(
  "/upload/*",
  bodyLimit({
    maxSize: 6 * 1024 * 1024, // 6 MB
    onError: (c) => c.json({ success: false, error: "Upload too large" }, 413),
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
  stripe: config.stripe.enabled ? "configured" : "unconfigured",
  corsOrigins: config.cors.origins,
  port: config.server.port,
});

// ── Graceful shutdown ─────────────────────────────────────────────────────
// `stopAcceptingRequests` is set after Bun.serve is invoked. The serve call
// at module-level is gated for tests: when running under `bun test` we
// import `app` for in-process Hono request handling and never call serve.
let stopAcceptingRequests: (() => void | Promise<void>) | null = null;

const isTestRun =
  typeof Bun !== "undefined" &&
  typeof (Bun as { jest?: unknown }).jest !== "undefined";

if (!isTestRun) {
  const server = Bun.serve({ port: config.server.port, fetch: app.fetch });
  stopAcceptingRequests = () => server.stop();
}

const shutdown = createShutdown({ hookTimeoutMs: 10_000 });

shutdown.register("postgres", async () => {
  // dbClient may be undefined under certain test mocks.
  if (dbClient && typeof dbClient.end === "function") {
    await dbClient.end({ timeout: 5 });
  }
});
shutdown.register("background-jobs", async () => {
  await stopBackgroundJobs();
});
shutdown.register("http-server", async () => {
  if (stopAcceptingRequests) await stopAcceptingRequests();
});

if (!isTestRun) {
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, async () => {
      await shutdown.run(sig);
      process.exit(0);
    });
  }
}

export default {
  port: config.server.port,
  fetch: app.fetch,
};
export { app, shutdown };
