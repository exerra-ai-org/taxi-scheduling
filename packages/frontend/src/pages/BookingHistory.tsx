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
  scheduled: "border-l-blue-400",
  assigned: "border-l-indigo-400",
  en_route: "border-l-orange-400",
  arrived: "border-l-purple-400",
  completed: "border-l-green-500",
  cancelled: "border-l-gray-300",
};

export default function BookingHistory() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
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
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
          <IconCar className="w-8 h-8 text-blue-400" />
        </div>
        <p className="text-gray-500 mb-1 font-medium">No bookings yet</p>
        <p className="text-sm text-gray-400 mb-6">
          Book your first ride to get started
        </p>
        <button
          onClick={() => navigate("/")}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Book a Ride
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My Bookings</h1>
      {bookings.map((b) => (
        <div
          key={b.id}
          className={`bg-white border border-l-4 rounded-lg p-4 ${STATUS_LEFT_BORDER[b.status] ?? "border-l-gray-200"}`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1 min-w-0 pr-3">
              <div className="flex items-start gap-1.5 text-sm font-medium">
                <IconMapPin className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                <span className="truncate">{b.pickupAddress}</span>
              </div>
              <div className="flex items-start gap-1.5 text-sm text-gray-500">
                <IconMapPin className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <span className="truncate">{b.dropoffAddress}</span>
              </div>
              <div className="text-xs text-gray-400">
                {formatDate(b.scheduledAt)}
              </div>
              <div className="text-sm font-semibold text-blue-700">
                {formatPrice(b.pricePence)}
                {b.discountPence > 0 && (
                  <span className="text-green-600 text-xs ml-1.5 font-normal">
                    (-{formatPrice(b.discountPence)})
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(b.status)}`}
              >
                {statusLabel(b.status)}
              </span>
              {b.isAirport && (
                <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                  AIRPORT
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-3 mt-3 pt-3 border-t border-gray-50">
            <button
              onClick={() => handleRebook(b)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Rebook
            </button>
            {(b.status === "scheduled" || b.status === "assigned") && (
              <button
                onClick={() => handleCancel(b.id)}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Cancel
              </button>
            )}
            {b.status === "completed" && (
              <button
                onClick={() => setReviewBookingId(b.id)}
                className="text-xs text-green-600 hover:text-green-800 font-medium"
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
      />
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
