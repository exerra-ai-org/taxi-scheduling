import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Booking } from "shared/types";
import { listBookings, cancelBooking } from "../api/bookings";
import {
  formatPrice,
  formatDate,
  statusLabel,
  statusColor,
} from "../lib/format";
import ReviewForm from "./ReviewForm";
import { SkeletonCard } from "../components/Skeleton";
import ConfirmDialog from "../components/ConfirmDialog";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../context/ToastContext";
import { IconMapPin, IconCar } from "../components/icons";

const STATUS_LEFT_BORDER: Record<string, string> = {
  scheduled: "border-l-[var(--color-blue-mid)]",
  assigned: "border-l-[var(--color-orange)]",
  en_route: "border-l-[var(--color-navy)]",
  arrived: "border-l-[var(--color-forest)]",
  completed: "border-l-[var(--color-green)]",
  cancelled: "border-l-[var(--color-border-light)]",
};

export default function BookingHistory() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Array<Booking & { hasReview?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [reviewBookingId, setReviewBookingId] = useState<number | null>(null);
  const { confirm, dialogProps } = useConfirm();
  const toast = useToast();

  async function fetchBookings() {
    try {
      const data = await listBookings();
      setBookings(data.bookings);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBookings();
  }, []);

  async function handleCancel(id: number) {
    const ok = await confirm({
      title: "Cancel Booking",
      message: "Are you sure you want to cancel this booking?",
      confirmLabel: "Cancel Booking",
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

  function handleRebook(booking: Booking) {
    navigate("/", {
      state: {
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
      },
    });
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <IconCar className="h-8 w-8" />
        </div>
        <p className="body-copy mb-1 font-medium">No bookings yet</p>
        <p className="caption-copy mb-6">Book your first ride to get started</p>
        <button onClick={() => navigate("/")} className="btn-primary">
          <span>Book a Ride</span>
          <span className="btn-icon">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="section-label">Customer</p>
          <h1 className="page-title mt-4 text-[40px]">My bookings</h1>
        </div>
      </div>
      {bookings.map((b, i) => (
        <div
          key={b.id}
          className={`glass-card hover-lift animate-stagger-in border-l-4 p-4 ${STATUS_LEFT_BORDER[b.status] ?? "border-l-[var(--color-border-light)]"}`}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1 min-w-0 pr-3">
              <div className="flex items-start gap-1.5 text-sm font-medium text-[var(--color-dark)]">
                <IconMapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-forest)]" />
                <span className="truncate">{b.pickupAddress}</span>
              </div>
              <div className="caption-copy flex items-start gap-1.5">
                <IconMapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-dark)]" />
                <span className="truncate">{b.dropoffAddress}</span>
              </div>
              <div className="mono-label">{formatDate(b.scheduledAt)}</div>
              <div className="body-copy font-bold text-[var(--color-dark)]">
                {formatPrice(b.pricePence)}
                {b.discountPence > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-[var(--color-forest)]">
                    (-{formatPrice(b.discountPence)})
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className={`status-pill ${statusColor(b.status)}`}>
                {statusLabel(b.status)}
              </span>
              {b.isAirport && (
                <span className="ds-tag tag-airport">AIRPORT</span>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-4 border-t border-[var(--color-border)] pt-3">
            <button onClick={() => handleRebook(b)} className="subtle-link">
              Rebook
            </button>
            {(b.status === "scheduled" || b.status === "assigned") && (
              <button
                onClick={() => handleCancel(b.id)}
                className="subtle-link text-[var(--color-error)]"
              >
                Cancel
              </button>
            )}
            {b.status === "completed" && !b.hasReview && (
              <button
                onClick={() => setReviewBookingId(b.id)}
                className="subtle-link text-[var(--color-forest)]"
              >
                Leave Review
              </button>
            )}
          </div>
        </div>
      ))}

      <ReviewForm
        bookingId={reviewBookingId}
        onClose={() => setReviewBookingId(null)}
        onSubmitted={fetchBookings}
      />
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
