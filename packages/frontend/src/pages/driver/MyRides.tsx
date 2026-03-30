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
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Rides</h1>
        <button
          onClick={fetchBookings}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {active.length > 0 && (
        <div className="space-y-2 mb-6">
          <h2 className="text-sm font-medium text-gray-500">Upcoming</h2>
          {active.map((b) => (
            <RideCard key={b.id} booking={b} onStatusUpdate={fetchBookings} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-500">Past</h2>
          {past.map((b) => (
            <RideCard key={b.id} booking={b} onStatusUpdate={fetchBookings} />
          ))}
        </div>
      )}

      {bookings.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          No rides assigned yet
        </div>
      )}
    </div>
  );
}
