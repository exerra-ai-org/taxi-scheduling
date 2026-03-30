import { useEffect, useState, useCallback } from "react";
import type { Booking, BookingStatus } from "shared/types";
import { listAllBookings } from "../../api/admin";
import { formatPrice, formatDate } from "../../lib/format";
import StatusBadge from "../../components/StatusBadge";
import { SkeletonCard } from "../../components/Skeleton";
import AlertsBanner from "./AlertsBanner";
import RideDetail from "./RideDetail";
import { IconCar } from "../../components/icons";
import ZoneMap from "../../components/maps/ZoneMap";

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
  const [showZoneMap, setShowZoneMap] = useState(false);

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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Ride Timeline</h1>
        <button
          onClick={() => setShowZoneMap((v) => !v)}
          className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          {showZoneMap ? "Hide Zone Map" : "Show Zone Map"}
        </button>
      </div>

      {showZoneMap && (
        <div className="mb-4">
          <ZoneMap />
        </div>
      )}

      <AlertsBanner
        bookings={bookings}
        onFilterUnassigned={() => setStatusFilter("scheduled")}
        onFilterStartingSoon={() => setStatusFilter("all")}
      />

      {/* Filters */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ").toUpperCase()}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 mb-4">
            <IconCar className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-400 text-sm">No rides found</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Route
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Scheduled
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Price
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 truncate max-w-xs">
                        {b.pickupAddress}
                      </div>
                      <div className="text-xs text-gray-400 truncate max-w-xs">
                        → {b.dropoffAddress}
                      </div>
                      {b.isAirport && (
                        <span className="inline-block mt-1 bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded font-medium">
                          AIRPORT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(b.scheduledAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {formatPrice(b.pricePence)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className="w-full text-left bg-white border rounded-xl p-3 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {b.pickupAddress}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      → {b.dropoffAddress}
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatDate(b.scheduledAt)} · {formatPrice(b.pricePence)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
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
        </>
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
