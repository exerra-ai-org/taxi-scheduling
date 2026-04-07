import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BookingData } from "../BookingFlow";
import { createBooking } from "../../api/bookings";
import {
  formatPrice,
  formatDate,
  formatCompactAddress,
} from "../../lib/format";
import { ApiError } from "../../api/client";

interface Props {
  data: BookingData;
  onBack: () => void;
  onReset: () => void;
}

export default function Confirmation({ data, onBack, onReset }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const compactPickup = formatCompactAddress(data.pickupAddress);
  const compactDropoff = formatCompactAddress(data.dropoffAddress);

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      const scheduledAt = new Date(`${data.date}T${data.time}`).toISOString();
      await createBooking({
        pickupAddress: data.pickupAddress,
        dropoffAddress: data.dropoffAddress,
        scheduledAt,
        couponCode: data.couponCode,
        pickupLat: data.pickupLat,
        pickupLon: data.pickupLon,
        dropoffLat: data.dropoffLat,
        dropoffLon: data.dropoffLon,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Booking failed");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center space-y-4 animate-fade-in">
        <div className="flex justify-center">
          <svg
            viewBox="0 0 52 52"
            className="h-20 w-20 text-[var(--color-green)]"
            fill="none"
          >
            <circle
              cx="26"
              cy="26"
              r="25"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M14 27l8 8 16-16"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="40"
              strokeDashoffset="40"
              style={{ animation: "check-stroke 0.4s 0.2s ease forwards" }}
            />
          </svg>
        </div>
        <h2 className="text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
          Booking confirmed
        </h2>
        <p className="caption-copy">
          Your ride from {compactPickup} to {compactDropoff} is scheduled.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate("/bookings")}
            className="btn-primary px-4"
          >
            View My Bookings
          </button>
          <button onClick={onReset} className="btn-secondary px-4">
            Book Another
          </button>
        </div>
      </div>
    );
  }

  const scheduledDate = new Date(`${data.date}T${data.time}`);

  return (
    <div className="space-y-4">
      <div>
        <p className="section-label">Step 05</p>
        <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
          Confirm booking
        </h2>
      </div>

      <div className="glass-card space-y-3 p-4">
        <div className="data-pair">
          <span>Pickup</span>
          <span className="max-w-[58%]" title={data.pickupAddress}>
            {compactPickup}
          </span>
        </div>
        <div className="data-pair">
          <span>Drop-off</span>
          <span className="max-w-[58%]" title={data.dropoffAddress}>
            {compactDropoff}
          </span>
        </div>
        <div className="data-pair">
          <span>Date & Time</span>
          <span>{formatDate(scheduledDate)}</span>
        </div>
        <div className="card-divider" />
        <div className="data-pair">
          <span>Price</span>
          <span>{formatPrice(data.pricePence)}</span>
        </div>
        {data.discountPence > 0 && (
          <>
            <div className="data-pair">
              <span>Discount ({data.couponCode})</span>
              <span>-{formatPrice(data.discountPence)}</span>
            </div>
            <div className="card-divider" />
          </>
        )}
        <div className="data-pair">
          <span>Total</span>
          <span>{formatPrice(data.finalPricePence)}</span>
        </div>
        {data.isAirport && (
          <div className="text-center">
            <span className="ds-tag tag-airport">AIRPORT TRANSFER</span>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary w-full flex-1">
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="btn-primary w-full flex-1 disabled:opacity-50"
        >
          {loading ? (
            <>
              <span>Booking...</span>
              <span className="btn-icon">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    opacity="0.25"
                  />
                  <path
                    d="M12 2a10 10 0 0 1 10 10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </>
          ) : (
            <>
              <span>Confirm</span>
              <span className="btn-icon">
                <span className="btn-icon-glyph">↗</span>
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
