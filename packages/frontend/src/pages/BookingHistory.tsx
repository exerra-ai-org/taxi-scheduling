import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listBookings, cancelBooking } from "../api/bookings";
import type { CustomerBooking } from "../api/bookings";
import {
  formatPrice,
  formatDate,
  statusLabel,
  statusColor,
} from "../lib/format";
import { BookingCardSkeleton } from "../components/Skeleton";
import ConfirmDialog from "../components/ConfirmDialog";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../context/ToastContext";
import {
  useRealtimeEvent,
  useRealtimeRecovery,
} from "../context/RealtimeContext";
import { IconMapPin, IconCar, IconStar } from "../components/icons";

type Tab = "active" | "upcoming" | "past";

const ACTIVE_STATUSES = new Set([
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
]);
const PAST_STATUSES = new Set(["completed", "cancelled"]);

export default function BookingHistory() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");
  const { confirm, dialogProps } = useConfirm();
  const toast = useToast();

  const fetchBookings = useCallback(async () => {
    try {
      const data = await listBookings();
      setBookings(data.bookings);
    } catch {
      // silently fail; toast from request layer when needed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Live updates — keep the list fresh without manual refresh.
  useRealtimeEvent("booking_created", fetchBookings);
  useRealtimeEvent("booking_updated", fetchBookings);
  useRealtimeEvent("drivers_assigned", fetchBookings);
  useRealtimeEvent("booking_cancelled", fetchBookings);
  useRealtimeRecovery(fetchBookings);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (tab === "active") return ACTIVE_STATUSES.has(b.status);
      if (tab === "past") return PAST_STATUSES.has(b.status);
      return b.status === "scheduled";
    });
  }, [bookings, tab]);

  async function handleCancel(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      title: "Cancel booking",
      message: "This cannot be undone. Continue?",
      confirmLabel: "Cancel ride",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await cancelBooking(id);
      toast.success("Booking cancelled");
      fetchBookings();
    } catch {
      toast.error("Failed to cancel booking");
    }
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="section-label">Customer</p>
          <h1 className="page-title">Bookings</h1>
        </div>
      </div>

      <div className="segmented-filter">
        <button
          onClick={() => setTab("active")}
          className={tab === "active" ? "is-active" : ""}
        >
          Active
        </button>
        <button
          onClick={() => setTab("upcoming")}
          className={tab === "upcoming" ? "is-active" : ""}
        >
          Upcoming
        </button>
        <button
          onClick={() => setTab("past")}
          className={tab === "past" ? "is-active" : ""}
        >
          Past
        </button>
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <BookingCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconCar className="h-8 w-8" />
          </div>
          <p className="body-copy mb-1 font-medium">
            {tab === "active"
              ? "No active rides"
              : tab === "upcoming"
                ? "Nothing scheduled"
                : "No past rides yet"}
          </p>
          <p className="caption-copy mb-6">
            {tab === "past"
              ? "Completed rides land here."
              : "Book a ride and it will appear here."}
          </p>
          <button onClick={() => navigate("/")} className="btn-green">
            <span>Book a ride</span>
            <span className="btn-icon" aria-hidden="true">
              <span className="btn-icon-glyph">↗</span>
            </span>
          </button>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="card-list">
          {filtered.map((b, i) => (
            <Link
              key={b.id}
              to={`/bookings/${b.id}`}
              className="page-card hover-lift animate-stagger-in block p-5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start gap-2">
                    <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-forest)]" />
                    <div className="text-[16px] font-medium tracking-[-0.01em] text-[var(--color-dark)] truncate">
                      {b.pickupAddress}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-dark)]" />
                    <div className="caption-copy truncate">
                      {b.dropoffAddress}
                    </div>
                  </div>
                  <div className="mono-label">{formatDate(b.scheduledAt)}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`status-pill ${statusColor(b.status)}`}>
                    {statusLabel(b.status)}
                  </span>
                  <div className="metric-value text-[24px] leading-none">
                    {formatPrice(b.pricePence)}
                  </div>
                  {b.isAirport && (
                    <span className="ds-tag tag-airport">AIRPORT</span>
                  )}
                </div>
              </div>

              {b.primaryDriverName && (
                <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-mid)]">
                  Driver: {b.primaryDriverName}
                  {b.primaryDriverPhone && (
                    <span className="text-[var(--color-muted)]">
                      {" · "}
                      {b.primaryDriverPhone}
                    </span>
                  )}
                </div>
              )}

              {b.status === "completed" &&
                b.reviewRating != null &&
                Number(b.reviewRating) > 0 && (
                  <div className="mt-3 border-t border-[var(--color-border)] pt-3 flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <IconStar
                        key={i}
                        className={`h-3.5 w-3.5 ${i < Number(b.reviewRating) ? "text-yellow-400" : "text-[var(--color-border)]"}`}
                      />
                    ))}
                    <span className="caption-copy ml-1 text-[var(--color-muted)]">
                      Your review
                    </span>
                  </div>
                )}

              {(b.status === "scheduled" || b.status === "assigned") && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={(e) => handleCancel(b.id, e)}
                    className="subtle-link text-[var(--color-error)]"
                  >
                    Cancel ride
                  </button>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
