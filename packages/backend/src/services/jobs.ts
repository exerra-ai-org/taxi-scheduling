import { runDriverWatchdog } from "./driverWatchdog";
import { notifyWatchdogResult, processDueRideReminders } from "./notifications";
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
  setTimeout(() => {
    void runTick();
  }, 2_000);

  const timer = setInterval(() => {
    void runTick();
  }, BACKGROUND_JOBS_TICK_SECONDS * 1_000);

  if (
    typeof (timer as unknown as { unref?: () => void }).unref === "function"
  ) {
    (timer as unknown as { unref: () => void }).unref();
  }

  logger.info("background jobs started", {
    tickSeconds: BACKGROUND_JOBS_TICK_SECONDS,
    rideReminderMinutes: config.jobs.rideReminderMinutes,
    lockId: TICK_LOCK_ID,
  });
}
