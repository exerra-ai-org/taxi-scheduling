import { runDriverWatchdog } from "./driverWatchdog";
import { notifyWatchdogResult, processDueRideReminders } from "./notifications";

const BACKGROUND_JOBS_ENABLED =
  String(process.env.BACKGROUND_JOBS_ENABLED || "true") !== "false";
const BACKGROUND_JOBS_TICK_SECONDS = Math.max(
  30,
  Number(process.env.BACKGROUND_JOBS_TICK_SECONDS || "60"),
);

let started = false;
let isTickRunning = false;
let lastTickWindowEnd: Date | null = null;

async function runTick(): Promise<void> {
  if (isTickRunning) {
    return;
  }

  isTickRunning = true;
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
    console.error("Background jobs tick failed:", cause);
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

  if (typeof (timer as unknown as { unref?: () => void }).unref === "function") {
    (timer as unknown as { unref: () => void }).unref();
  }

  console.log(
    `Background jobs started: tick=${BACKGROUND_JOBS_TICK_SECONDS}s, reminders=${process.env.RIDE_REMINDER_MINUTES || "120,60,15"}`,
  );
}
