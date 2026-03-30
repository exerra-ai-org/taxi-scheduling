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

export default function BookingHistory() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewBookingId, setReviewBookingId] = useState<number | null>(null);

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
    if (!confirm("Cancel this booking?")) return;
    try {
      await cancelBooking(id);
      fetchBookings();
    } catch {
      alert("Failed to cancel booking");
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
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">No bookings yet.</p>
        <button
          onClick={() => navigate("/")}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
        >
          Book Your First Ride
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My Bookings</h1>
      {bookings.map((b) => (
        <div key={b.id} className="bg-white border rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {b.pickupAddress} → {b.dropoffAddress}
              </div>
              <div className="text-xs text-gray-500">
                {formatDate(b.scheduledAt)}
              </div>
              <div className="text-sm font-medium text-blue-700">
                {formatPrice(b.pricePence)}
                {b.discountPence > 0 && (
                  <span className="text-green-600 text-xs ml-1">
                    (-{formatPrice(b.discountPence)})
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
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
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => handleRebook(b)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Rebook
            </button>
            {(b.status === "scheduled" || b.status === "assigned") && (
              <button
                onClick={() => handleCancel(b.id)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                Cancel
              </button>
            )}
            {b.status === "completed" && (
              <button
                onClick={() => setReviewBookingId(b.id)}
                className="text-xs text-green-600 hover:text-green-800"
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
    </div>
  );
}
