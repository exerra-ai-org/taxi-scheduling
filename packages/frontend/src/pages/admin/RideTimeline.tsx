import { useEffect, useState, useCallback, useMemo } from "react";
import type { Booking } from "shared/types";
import { listAllBookings } from "../../api/admin";
import { useRealtimeEvent } from "../../context/RealtimeContext";
import { formatPrice, formatDate, statusLabel } from "../../lib/format";
import { SkeletonCard } from "../../components/Skeleton";
import AlertsBanner from "./AlertsBanner";
import RideDetail from "./RideDetail";
import { IconCar, IconRefresh } from "../../components/icons";

type QueueFilter = "attention" | "unassigned" | "soon" | "active" | "all";

const ACTIVE_STATUSES = new Set([
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
]);
const DONE_STATUSES = new Set(["completed", "cancelled"]);
const SOON_MS = 2 * 60 * 60 * 1000;

function rideTime(booking: Booking) {
  return new Date(booking.scheduledAt).getTime();
}

function isStartingSoon(booking: Booking) {
  const startsAt = rideTime(booking);
  const now = Date.now();
  return startsAt >= now && startsAt <= now + SOON_MS;
}

function urgencyRank(booking: Booking) {
  if (booking.status === "scheduled" && isStartingSoon(booking)) return 0;
  if (booking.status === "scheduled") return 1;
  if (isStartingSoon(booking) && !DONE_STATUSES.has(booking.status)) return 2;
  if (ACTIVE_STATUSES.has(booking.status)) return 3;
  if (booking.status === "cancelled") return 6;
  if (booking.status === "completed") return 7;
  return 4;
}

function timeSignal(booking: Booking) {
  const minutes = Math.round((rideTime(booking) - Date.now()) / 60000);
  if (minutes < 0 && !DONE_STATUSES.has(booking.status)) return "Late";
  if (minutes < 60 && minutes >= 0) return `${minutes}m`;
  if (minutes < 24 * 60 && minutes >= 0) return `${Math.round(minutes / 60)}h`;
  const d = new Date(booking.scheduledAt);
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`;
}

function queueLabel(filter: QueueFilter) {
  const labels: Record<QueueFilter, string> = {
    attention: "Attention",
    unassigned: "Unassigned",
    soon: "Soon",
    active: "Active",
    all: "All",
  };
  return labels[filter];
}

export default function RideTimeline() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QueueFilter>("attention");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
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
  }, [fetchBookings]);

  useRealtimeEvent("booking_created", fetchBookings);
  useRealtimeEvent("booking_updated", fetchBookings);
  useRealtimeEvent("drivers_assigned", fetchBookings);
  useRealtimeEvent("booking_cancelled", fetchBookings);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const updateMedia = () => setIsDesktop(media.matches);
    updateMedia();
    media.addEventListener("change", updateMedia);
    return () => media.removeEventListener("change", updateMedia);
  }, []);

  const counts = useMemo(() => {
    const soon = bookings.filter(
      (b) => isStartingSoon(b) && !DONE_STATUSES.has(b.status),
    ).length;
    const unassigned = bookings.filter((b) => b.status === "scheduled").length;
    const active = bookings.filter((b) => ACTIVE_STATUSES.has(b.status)).length;
    const attention = bookings.filter(
      (b) =>
        b.status === "scheduled" ||
        (isStartingSoon(b) && !DONE_STATUSES.has(b.status)),
    ).length;
    return { attention, unassigned, soon, active, all: bookings.length };
  }, [bookings]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bookings
      .filter((booking) => {
        if (filter === "unassigned") return booking.status === "scheduled";
        if (filter === "soon") {
          return isStartingSoon(booking) && !DONE_STATUSES.has(booking.status);
        }
        if (filter === "active") return ACTIVE_STATUSES.has(booking.status);
        if (filter === "attention") {
          return (
            booking.status === "scheduled" ||
            (isStartingSoon(booking) && !DONE_STATUSES.has(booking.status))
          );
        }
        return true;
      })
      .filter((booking) => {
        if (!term) return true;
        return [
          booking.pickupAddress,
          booking.dropoffAddress,
          booking.customerName ?? "",
          booking.customerPhone ?? "",
          statusLabel(booking.status),
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort(
        (a, b) => urgencyRank(a) - urgencyRank(b) || rideTime(a) - rideTime(b),
      );
  }, [bookings, filter, search]);

  useEffect(() => {
    const hasSelection = selectedId
      ? filtered.some((booking) => booking.id === selectedId)
      : false;
    if (hasSelection) {
      return;
    }
    setSelectedId(isDesktop ? (filtered[0]?.id ?? null) : null);
  }, [filtered, isDesktop, selectedId]);

  const selectedBooking = filtered.find((booking) => booking.id === selectedId);

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
    <div className="page-stack admin-dispatch-page">
      <div className="page-header">
        <div>
          <p className="section-label">Admin</p>
          <h1 className="page-title">Dispatch</h1>
          <p className="page-subtitle">
            Assign drivers, monitor live rides, and keep the next operational
            decision in view.
          </p>
        </div>
        <button onClick={fetchBookings} className="page-header-btn">
          <IconRefresh className="h-4 w-4" />
          <span className="page-header-btn-label">Refresh</span>
        </button>
      </div>

      <AlertsBanner
        bookings={bookings}
        onFilterUnassigned={() => setFilter("unassigned")}
        onFilterStartingSoon={() => setFilter("soon")}
      />

      <div className="admin-command-bar">
        <label className="admin-search-field">
          <span className="sr-only">Search rides</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search route, customer, phone, status"
            className="input-glass"
          />
        </label>
        <div
          className="segmented-filter admin-filter-strip"
          aria-label="Ride queue filters"
        >
          {(
            [
              "attention",
              "unassigned",
              "soon",
              "active",
              "all",
            ] as QueueFilter[]
          ).map((option) => (
            <button
              key={option}
              onClick={() => setFilter(option)}
              className={filter === option ? "is-active" : ""}
            >
              {queueLabel(option)}
              <span className="admin-filter-count">{counts[option]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="admin-dispatch-grid">
        <section className="admin-queue-panel" aria-label="Ride queue">
          <div className="admin-queue-header">
            <div>
              <p className="section-label">Queue</p>
              <p className="caption-copy mt-1">
                {filtered.length} {filtered.length === 1 ? "ride" : "rides"}{" "}
                shown
              </p>
            </div>
            <span className="mono-label">30s refresh</span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state admin-empty-state">
              <div className="empty-state-icon">
                <IconCar className="h-8 w-8" />
              </div>
              <p className="body-copy mb-1 font-medium">
                No rides match this view
              </p>
              <p className="caption-copy">Change the filter or search term.</p>
            </div>
          ) : (
            <div className="admin-ride-list">
              {filtered.map((booking) => {
                const isSelected = booking.id === selectedId;
                return (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => setSelectedId(booking.id)}
                    className={`admin-ride-row ${isSelected ? "is-selected" : ""} ${
                      booking.status === "scheduled" && isStartingSoon(booking)
                        ? "is-urgent"
                        : ""
                    }`}
                    aria-pressed={isSelected}
                  >
                    <span className="admin-ride-time">
                      <span className="admin-ride-time-value">
                        {timeSignal(booking)}
                      </span>
                      <span className="admin-ride-time-label">
                        {booking.status === "scheduled"
                          ? "Needs driver"
                          : statusLabel(booking.status)}
                      </span>
                    </span>
                    <span className="admin-ride-main">
                      <span className="admin-ride-route">
                        {booking.pickupAddress} → {booking.dropoffAddress}
                      </span>
                      <span className="admin-ride-meta">
                        <span>{formatDate(booking.scheduledAt)}</span>
                        <span>{formatPrice(booking.pricePence)}</span>
                        {booking.customerName && (
                          <span>{booking.customerName}</span>
                        )}
                        {booking.isAirport && (
                          <span className="admin-ride-airport-flag">
                            Airport
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="admin-detail-panel" aria-label="Selected ride detail">
          <RideDetail
            bookingId={selectedBooking?.id ?? null}
            onClose={() => setSelectedId(null)}
            onUpdated={fetchBookings}
            variant="panel"
          />
        </aside>
      </div>

      {!isDesktop && (
        <RideDetail
          bookingId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={fetchBookings}
          variant="modal"
        />
      )}
    </div>
  );
}
