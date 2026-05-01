import { useState, useEffect, useRef, useCallback } from "react";
import { sendHeartbeat } from "../api/drivers";

export type GpsStatus = "idle" | "acquiring" | "active" | "no-gps" | "denied";

// Cadence is status-driven: faster while the customer is watching the map,
// slower while the driver is just heading to pickup. Balances UX (smooth
// marker) against driver battery and data usage.
const HEARTBEAT_MS_BY_STATUS: Record<string, number> = {
  assigned: 30_000,
  en_route: 5_000,
  arrived: 15_000,
  in_progress: 5_000,
};
const HEARTBEAT_MS_DEFAULT = 30_000;

const ACTIVE_STATUSES = new Set(Object.keys(HEARTBEAT_MS_BY_STATUS));

export function useDriverHeartbeat(
  bookingId: number | null,
  status: string | null,
): { gpsStatus: GpsStatus } {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const coordsRef = useRef<{
    lat: number;
    lon: number;
    accuracyM?: number;
    speedMps?: number;
  } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);

  const isActive = Boolean(bookingId && status && ACTIVE_STATUSES.has(status));
  const intervalMs = status
    ? (HEARTBEAT_MS_BY_STATUS[status] ?? HEARTBEAT_MS_DEFAULT)
    : HEARTBEAT_MS_DEFAULT;

  const beat = useCallback(async () => {
    if (!bookingId) return;
    try {
      await sendHeartbeat({
        bookingId,
        lat: coordsRef.current?.lat,
        lon: coordsRef.current?.lon,
        accuracyM: coordsRef.current?.accuracyM,
        speedMps: coordsRef.current?.speedMps,
      });
    } catch {
      // Missed heartbeat — backend watchdog handles recovery
    }
  }, [bookingId]);

  useEffect(() => {
    if (!isActive) {
      setGpsStatus("idle");
      coordsRef.current = null;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchRef.current !== null)
        navigator.geolocation?.clearWatch(watchRef.current);
      intervalRef.current = null;
      watchRef.current = null;
      return;
    }

    if ("geolocation" in navigator) {
      setGpsStatus("acquiring");
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          coordsRef.current = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            // pos.coords.speed is null when stationary or unsupported
            speedMps:
              pos.coords.speed != null && pos.coords.speed >= 0
                ? pos.coords.speed
                : undefined,
          };
          setGpsStatus("active");
        },
        () => setGpsStatus("denied"),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
      );
    } else {
      setGpsStatus("no-gps");
    }

    beat();
    intervalRef.current = setInterval(beat, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchRef.current !== null)
        navigator.geolocation?.clearWatch(watchRef.current);
      intervalRef.current = null;
      watchRef.current = null;
    };
  }, [isActive, intervalMs, beat]);

  return { gpsStatus };
}
