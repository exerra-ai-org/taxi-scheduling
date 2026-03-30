import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BookingData } from "../BookingFlow";
import { createBooking } from "../../api/bookings";
import { formatPrice, formatDate } from "../../lib/format";
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
        {/* Animated SVG checkmark */}
        <div className="flex justify-center">
          <svg
            viewBox="0 0 52 52"
            className="w-20 h-20 text-green-500"
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
        <h2 className="text-xl font-semibold text-green-700">
          Booking Confirmed!
        </h2>
        <p className="text-sm text-gray-500">
          Your ride from {data.pickupAddress} to {data.dropoffAddress} is
          scheduled.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate("/bookings")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            View My Bookings
          </button>
          <button
            onClick={onReset}
            className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Book Another
          </button>
        </div>
      </div>
    );
  }

  const scheduledDate = new Date(`${data.date}T${data.time}`);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Confirm Booking</h2>

      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Pickup</span>
          <span className="font-medium text-right max-w-[60%]">
            {data.pickupAddress}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Drop-off</span>
          <span className="font-medium text-right max-w-[60%]">
            {data.dropoffAddress}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Date & Time</span>
          <span className="font-medium">{formatDate(scheduledDate)}</span>
        </div>
        <hr className="border-gray-100" />
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Price</span>
          <span>{formatPrice(data.pricePence)}</span>
        </div>
        {data.discountPence > 0 && (
          <>
            <div className="flex justify-between text-sm text-green-700">
              <span>Discount ({data.couponCode})</span>
              <span>-{formatPrice(data.discountPence)}</span>
            </div>
            <hr className="border-gray-100" />
          </>
        )}
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="text-blue-700">
            {formatPrice(data.finalPricePence)}
          </span>
        </div>
        {data.isAirport && (
          <div className="text-center">
            <span className="inline-block bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
              AIRPORT TRANSFER
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm border border-red-100">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors btn-press"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin w-4 h-4"
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
              Booking...
            </span>
          ) : (
            "Confirm Booking"
          )}
        </button>
      </div>
    </div>
  );
}
