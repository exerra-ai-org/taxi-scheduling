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
  onSubmitted?: () => void;
}

export default function ReviewForm({ bookingId, onClose, onSubmitted }: Props) {
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
    setDriverId(null);
    // Fetch booking to get driver ID
    getBooking(bookingId)
      .then((data) => {
        const primaryActive = data.assignments.find(
          (a) => a.isActive && a.role === "primary",
        );
        const fallbackActive = data.assignments.find((a) => a.isActive);
        const selected = primaryActive || fallbackActive;
        if (selected) {
          setDriverId(selected.driverId);
        } else {
          setError("No active driver assignment found for this booking");
        }
      })
      .catch(() => {
        setError("Unable to load booking details");
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
      onSubmitted?.();
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
        {error && <div className="alert alert-error">{error}</div>}
        <div>
          <label className="field-label mb-2 block">Rating</label>
          <StarRating value={rating} onChange={setRating} />
        </div>
        <div>
          <label className="field-label mb-2 block">
            Comment
            <span className="normal-case tracking-normal text-[var(--color-muted)]">
              {" "}
              (optional)
            </span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="ds-textarea"
            placeholder="How was your ride?"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !rating || !driverId}
          className="btn-primary w-full"
        >
          {loading ? "Submitting..." : "Submit Review"}
        </button>
      </form>
    </Modal>
  );
}
