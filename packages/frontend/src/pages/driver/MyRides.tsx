import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import type { Booking } from "shared/types";
import { listBookings } from "../../api/bookings";
import {
  useRealtimeEvent,
  useRealtimeRecovery,
} from "../../context/RealtimeContext";
import { useAuth } from "../../context/AuthContext";
import RideCard from "./RideCard";
import { SkeletonCard } from "../../components/Skeleton";
import {
  useDriverHeartbeat,
  type GpsStatus,
} from "../../hooks/useDriverHeartbeat";
import { useDriverPresence } from "../../hooks/useDriverPresence";
import { IconGps, IconUser, IconRefresh } from "../../components/icons";

const GPS_LABEL: Record<GpsStatus, string> = {
  idle: "",
  acquiring: "Acquiring GPS…",
  active: "GPS active — sending location",
  "no-gps": "No GPS — sending heartbeat only",
  denied: "Location denied — sending heartbeat only",
};

// Priority order for GPS tracking: in_progress > en_route > arrived > assigned
function pickTrackingBooking(active: Booking[]): Booking | null {
  return (
    active.find((b) => b.status === "in_progress") ??
    active.find((b) => b.status === "en_route") ??
    active.find((b) => b.status === "arrived") ??
    active.find((b) => b.status === "assigned") ??
    null
  );
}

export default function MyRides() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    try {
      const data = await listBookings();
      setBookings(data.bookings);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useRealtimeEvent("booking_updated", fetchBookings);
  useRealtimeEvent("drivers_assigned", fetchBookings);
  useRealtimeEvent("booking_cancelled", fetchBookings);
  useRealtimeRecovery(fetchBookings);

  const active = bookings.filter(
    (b) => !["completed", "cancelled"].includes(b.status),
  );
  const past = bookings.filter((b) =>
    ["completed", "cancelled"].includes(b.status),
  );

  const trackingBooking = pickTrackingBooking(active);
  const { gpsStatus } = useDriverHeartbeat(
    trackingBooking?.id ?? null,
    trackingBooking?.status ?? null,
  );

  const { user } = useAuth();
  // While there's an active tracking booking, useDriverHeartbeat owns the
  // GPS watcher and the heartbeat endpoint mirrors presence. Suppress the
  // separate presence GPS watcher to halve battery + redundant requests.
  const { isOnDuty, toggleOnDuty } = useDriverPresence(
    user?.id ?? null,
    trackingBooking != null,
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const gpsLabel = GPS_LABEL[gpsStatus];
  const gpsColor =
    gpsStatus === "active"
      ? "text-[var(--color-forest)]"
      : gpsStatus === "acquiring"
        ? "text-[var(--color-orange)]"
        : "text-[var(--color-muted)]";

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="section-label">Driver</p>
          <h1 className="page-title">My rides</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleOnDuty}
            className="page-header-btn"
            aria-pressed={isOnDuty}
            title={
              isOnDuty
                ? "You're visible on the dispatch map"
                : "Go on duty to be visible on the dispatch map"
            }
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isOnDuty
                  ? "bg-[var(--color-forest)] animate-pulse"
                  : "bg-[var(--color-muted)]"
              }`}
            />
            <span className="page-header-btn-label">
              {isOnDuty ? "On duty" : "Off duty"}
            </span>
          </button>
          <Link to="/driver/profile" className="page-header-btn">
            <IconUser className="h-4 w-4" />
            <span className="page-header-btn-label">Profile</span>
          </Link>
          <button onClick={fetchBookings} className="page-header-btn">
            <IconRefresh className="h-4 w-4" />
            <span className="page-header-btn-label">Refresh</span>
          </button>
        </div>
      </div>

      {gpsStatus !== "idle" && gpsLabel && (
        <div className={`flex items-center gap-2 caption-copy ${gpsColor}`}>
          <IconGps className="h-3.5 w-3.5 shrink-0" />
          <span>{gpsLabel}</span>
          {gpsStatus === "active" && (
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          )}
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-2 mb-6">
          <h2 className="section-label">Upcoming</h2>
          {active.map((b) => (
            <RideCard key={b.id} booking={b} onStatusUpdate={fetchBookings} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <h2 className="section-label">Past</h2>
          {past.map((b) => (
            <RideCard key={b.id} booking={b} onStatusUpdate={fetchBookings} />
          ))}
        </div>
      )}

      {bookings.length === 0 && (
        <div className="empty-state caption-copy">No rides assigned yet</div>
      )}
    </div>
  );
}
