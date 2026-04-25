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
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="section-label">Admin</p>
          <h1 className="page-title mt-4 text-[40px]">Ride timeline</h1>
        </div>
        <button
          onClick={() => setShowZoneMap((v) => !v)}
          className="btn-secondary button-text-compact"
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

      <div className="segmented-filter overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`whitespace-nowrap ${statusFilter === s ? "is-active" : ""}`}
          >
            {s === "all" ? "All" : s.replace("_", " ").toUpperCase()}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconCar className="h-8 w-8" />
          </div>
          <p className="caption-copy">No rides found</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block glass-table">
            <table className="ds-table w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    className="cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate font-medium text-[var(--color-dark)]">
                        {b.pickupAddress}
                      </div>
                      <div className="mono-label max-w-xs truncate">
                        → {b.dropoffAddress}
                      </div>
                      {b.isAirport && (
                        <span className="ds-tag tag-airport mt-2 inline-flex">
                          AIRPORT
                        </span>
                      )}
                    </td>
                    <td className="mono-label whitespace-nowrap px-4 py-3">
                      {formatDate(b.scheduledAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--color-dark)]">
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

          <div className="md:hidden space-y-2">
            {filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className="w-full text-left glass-card p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                    <div className="truncate text-sm font-medium text-[var(--color-dark)]">
                      {b.pickupAddress}
                    </div>
                    <div className="mono-label truncate">
                      → {b.dropoffAddress}
                    </div>
                    <div className="mono-label">
                      {formatDate(b.scheduledAt)} · {formatPrice(b.pricePence)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={b.status} />
                    {b.isAirport && (
                      <span className="ds-tag tag-airport">AIRPORT</span>
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
