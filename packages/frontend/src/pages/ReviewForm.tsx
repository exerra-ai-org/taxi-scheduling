import { useState, useEffect } from "react";
import Modal from "../components/Modal";
import StarRating from "../components/StarRating";
import { getBooking } from "../api/bookings";
import { createReview } from "../api/reviews";
import { ApiError } from "../api/client";
import { useToast } from "../context/ToastContext";

interface Props {
  bookingId: number | null;
  onClose: () => void;
}

export default function ReviewForm({ bookingId, onClose }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [driverId, setDriverId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!bookingId) return;
    setRating(0);
    setComment("");
    setError("");
    // Fetch booking to get driver ID
    getBooking(bookingId).then((data) => {
      const activeDriver = data.assignments.find((a) => a.isActive);
      if (activeDriver) setDriverId(activeDriver.driverId);
    });
  }, [bookingId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookingId || !driverId || !rating) return;
    setLoading(true);
    setError("");
    try {
      await createReview({
        bookingId,
        driverId,
        rating,
        comment: comment || undefined,
      });
      toast.success("Review submitted — thank you!");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={!!bookingId} onClose={onClose} title="Leave a Review">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm border border-red-100">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rating
          </label>
          <StarRating value={rating} onChange={setRating} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Comment
            <span className="text-gray-400 font-normal"> (optional)</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            placeholder="How was your ride?"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !rating}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors btn-press"
        >
          {loading ? "Submitting..." : "Submit Review"}
        </button>
      </form>
    </Modal>
  );
}
