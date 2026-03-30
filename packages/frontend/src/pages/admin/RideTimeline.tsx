import { useEffect, useState, useCallback } from "react";
import type { Booking, BookingStatus } from "shared/types";
import { listAllBookings } from "../../api/admin";
import { formatPrice, formatDate } from "../../lib/format";
import StatusBadge from "../../components/StatusBadge";
import { SkeletonCard } from "../../components/Skeleton";
import AlertsBanner from "./AlertsBanner";
import RideDetail from "./RideDetail";

const STATUS_OPTIONS: (BookingStatus | "all")[] = [
  "all",
  "scheduled",
  "assigned",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
];

export default function RideTimeline() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">(
    "all",
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const fetchBookings = useCallback(async () => {
    try {
      const data = await listAllBookings();
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

  const filtered =
    statusFilter === "all"
      ? bookings
      : bookings.filter((b) => b.status === statusFilter);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Ride Timeline</h1>

      <AlertsBanner
        bookings={bookings}
        onFilterUnassigned={() => setStatusFilter("scheduled")}
        onFilterStartingSoon={() => setStatusFilter("all")}
      />

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ${
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ").toUpperCase()}
          </button>
        ))}
      </div>

      {/* Ride list */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No rides found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedId(b.id)}
              className="w-full text-left bg-white border rounded-lg p-3 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {b.pickupAddress} → {b.dropoffAddress}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(b.scheduledAt)} · {formatPrice(b.pricePence)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={b.status} />
                  {b.isAirport && (
                    <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                      AIRPORT
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      <RideDetail
        bookingId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={fetchBookings}
      />
    </div>
  );
}
