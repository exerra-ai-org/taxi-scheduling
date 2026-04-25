import { useEffect, useState, useCallback } from "react";
import type { Booking } from "shared/types";
import { listBookings } from "../../api/bookings";
import RideCard from "./RideCard";
import { SkeletonCard } from "../../components/Skeleton";

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
    const interval = setInterval(fetchBookings, 30000);
    return () => clearInterval(interval);
  }, [fetchBookings]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const active = bookings.filter(
    (b) => !["completed", "cancelled"].includes(b.status),
  );
  const past = bookings.filter((b) =>
    ["completed", "cancelled"].includes(b.status),
  );

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="section-label">Driver</p>
          <h1 className="page-title mt-4 text-[40px]">My rides</h1>
        </div>
        <button
          onClick={fetchBookings}
          className="btn-secondary button-text-compact"
        >
          Refresh
        </button>
      </div>

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
