/**
 * Pure heartbeat classification — given the latest heartbeat row for a
 * primary driver on an active booking, decide what the watchdog should
 * do.
 *
 * Splitting this out of runDriverWatchdog() lets us unit-test boundary
 * behaviour without spinning up Postgres, and lets the SQL refactor in
 * driverWatchdog.ts focus only on the I/O.
 */
export interface ClassifyInput {
  now: Date;
  staleMinutes: number;
  fallbackWindows: number;
  lastHeartbeatAt: Date | null;
  missedWindows: number;
}

export type ClassifyResult =
  | { kind: "ok"; shouldResetMissedWindows: boolean }
  | { kind: "warn"; newMissedWindows: number }
  | { kind: "fallback"; newMissedWindows: number };

export function classifyHeartbeat(input: ClassifyInput): ClassifyResult {
  const staleThreshold = new Date(
    input.now.getTime() - input.staleMinutes * 60 * 1000,
  );
  const isStale =
    input.lastHeartbeatAt === null || input.lastHeartbeatAt < staleThreshold;

  if (!isStale) {
    return {
      kind: "ok",
      shouldResetMissedWindows: input.missedWindows !== 0,
    };
  }

  const newMissedWindows = (input.missedWindows ?? 0) + 1;
  if (newMissedWindows < input.fallbackWindows) {
    return { kind: "warn", newMissedWindows };
  }
  return { kind: "fallback", newMissedWindows };
}
