import { runDriverWatchdog } from "./driverWatchdog";
import { notifyWatchdogResult, processDueRideReminders } from "./notifications";
import { expirePendingPayments } from "./paymentExpiry";
import { config } from "../config";
import { db } from "../db/index";
import { withAdvisoryLock } from "../lib/advisoryLock";
import { logger } from "../lib/logger";

const BACKGROUND_JOBS_ENABLED = config.jobs.enabled;
const BACKGROUND_JOBS_TICK_SECONDS = config.jobs.tickSeconds;
// Cluster-wide lock id for the background tick. Picked once and never
// changed — every replica must use the same id to coordinate.
const TICK_LOCK_ID = 8472001;

let started = false;
let isTickRunning = false;
let lastTickWindowEnd: Date | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let warmupTimer: ReturnType<typeof setTimeout> | null = null;

async function runTick(): Promise<void> {
  if (isTickRunning) {
    return;
  }

  isTickRunning = true;
  try {
    const result = await withAdvisoryLock(db, TICK_LOCK_ID, async () => {
      const now = new Date();
      const previous =
        lastTickWindowEnd ||
        new Date(now.getTime() - BACKGROUND_JOBS_TICK_SECONDS * 1000);
      lastTickWindowEnd = now;

      try {
        const watchdogResult = await runDriverWatchdog(now);
        await notifyWatchdogResult(watchdogResult);
        await processDueRideReminders(previous, now);
        await expirePendingPayments(now);
      } catch (cause) {
        logger.error("background tick failed", { err: cause as Error });
      }
    });

    if (!result.ran) {
      logger.debug("background tick skipped — another replica holds the lock");
    }
  } catch (cause) {
    // Lock acquire/release errors should not crash the loop.
    logger.error("background tick lock failed", { err: cause as Error });
  } finally {
    isTickRunning = false;
  }
}

export function startBackgroundJobs(): void {
  if (started || !BACKGROUND_JOBS_ENABLED) {
    return;
  }

  started = true;

  // Warm-up tick shortly after startup.
  warmupTimer = setTimeout(() => {
    void runTick();
  }, 2_000);

  tickInterval = setInterval(() => {
    void runTick();
  }, BACKGROUND_JOBS_TICK_SECONDS * 1_000);

  if (
    typeof (tickInterval as unknown as { unref?: () => void }).unref ===
    "function"
  ) {
    (tickInterval as unknown as { unref: () => void }).unref();
  }

  logger.info("background jobs started", {
    tickSeconds: BACKGROUND_JOBS_TICK_SECONDS,
    rideReminderMinutes: config.jobs.rideReminderMinutes,
    lockId: TICK_LOCK_ID,
  });
}

/**
 * Stop emitting new ticks and wait for any in-flight tick to settle.
 * Used by the graceful-shutdown handler.
 */
export async function stopBackgroundJobs(): Promise<void> {
  if (warmupTimer) clearTimeout(warmupTimer);
  if (tickInterval) clearInterval(tickInterval);
  warmupTimer = null;
  tickInterval = null;

  // Wait up to 5s for an in-flight tick to settle.
  const deadline = Date.now() + 5_000;
  while (isTickRunning && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  started = false;
  logger.info("background jobs stopped");
}
