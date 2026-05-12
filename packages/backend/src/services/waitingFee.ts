// Pickup waiting-fee math.
//
// Anchor: bookings.driver_arrived_at (set when driver hits status=arrived).
// Stop:   bookings.customer_arrived_at (customer's "I'm here") OR the
//         transition into in_progress / no-show, whichever fires first.
//
// Policy (defaults; overridable from app_settings):
//   • First 30 minutes after driver arrival are free.
//   • After that, 200p per 5 min (rounded UP to the next increment).
//
// All times in milliseconds. Fee returned in pence.

import { getSettingInt } from "./appSettings";

export interface WaitingFeeInputs {
  driverArrivedAt: Date | null;
  customerArrivedAt: Date | null;
  // Override "now" for tests + for the no-show path which freezes the
  // timer at the no-show stamp.
  endAt?: Date;
}

export interface WaitingFeeConfig {
  freeMinutes: number;
  ratePence: number;
  incrementMinutes: number;
}

export async function loadWaitingFeeConfig(): Promise<WaitingFeeConfig> {
  const [freeMinutes, ratePence, incrementMinutes] = await Promise.all([
    getSettingInt("waitingFreeMinutes"),
    getSettingInt("waitingRatePence"),
    getSettingInt("waitingIncrementMinutes"),
  ]);
  return {
    freeMinutes: Math.max(0, freeMinutes),
    ratePence: Math.max(0, ratePence),
    incrementMinutes: Math.max(1, incrementMinutes),
  };
}

export function computeWaitingFee(
  inputs: WaitingFeeInputs,
  cfg: WaitingFeeConfig,
): number {
  if (!inputs.driverArrivedAt) return 0;

  const end =
    inputs.customerArrivedAt?.getTime() ??
    inputs.endAt?.getTime() ??
    Date.now();
  const start = inputs.driverArrivedAt.getTime();
  const elapsedMs = Math.max(0, end - start);
  const elapsedMin = elapsedMs / 60_000;
  const billableMin = elapsedMin - cfg.freeMinutes;
  if (billableMin <= 0) return 0;

  const blocks = Math.ceil(billableMin / cfg.incrementMinutes);
  return blocks * cfg.ratePence;
}

// Convenience: load config + compute in one call. Used by the booking
// status-transition handler.
export async function computeWaitingFeeFor(booking: {
  driverArrivedAt: Date | null;
  customerArrivedAt: Date | null;
}): Promise<number> {
  const cfg = await loadWaitingFeeConfig();
  return computeWaitingFee(
    {
      driverArrivedAt: booking.driverArrivedAt,
      customerArrivedAt: booking.customerArrivedAt,
    },
    cfg,
  );
}
