import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BookingData } from "../BookingFlow";
import { clearBookingDraft } from "../BookingFlow";
import { createBooking, type BookingPaymentInit } from "../../api/bookings";
import { formatPrice, formatDate } from "../../lib/format";
import { ApiError } from "../../api/client";
import { useToast } from "../../context/ToastContext";

interface Props {
  data: BookingData;
  onBack: () => void;
  onReset: () => void;
  /** Called when the booking is created and Stripe returns a payment
   * intent. The parent flow advances to the PaymentStep. If `payment`
   * is null, payments are disabled — the parent should treat this as
   * the legacy "booking confirmed" terminal state. */
  onBookingCreated: (
    bookingId: number,
    payment: BookingPaymentInit | null,
  ) => void;
}

/**
 * Compact a Nominatim-style address ("Heathrow Airport, London Borough of
 * Hillingdon, London, TW6 1QG, United Kingdom") down to its identifying
 * head ("Heathrow Airport, London") so the row fits on one line. Full address
 * is preserved in the title attribute for users who want it.
 */
function shortAddress(addr: string): string {
  if (!addr) return "";
  const parts = addr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 2) return addr;
  // Drop the country at the end if it's the last segment, then take the first
  // two segments (place + city/area).
  const trimmed =
    parts[parts.length - 1].length <= 14 ? parts.slice(0, -1) : parts;
  return trimmed.slice(0, 2).join(", ");
}

export default function Confirmation({
  data,
  onBack,
  onReset,
  onBookingCreated,
}: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const scheduledDate = new Date(`${data.date}T${data.time}`);

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      const { booking, payment } = await createBooking({
        pickupAddress: data.pickupAddress,
        dropoffAddress: data.dropoffAddress,
        scheduledAt: scheduledDate.toISOString(),
        vehicleClass: data.vehicleClass,
        pickupLat: data.pickupLat,
        pickupLon: data.pickupLon,
        dropoffLat: data.dropoffLat,
        dropoffLon: data.dropoffLon,
        couponCode: data.couponCode,
        pickupFlightNumber: data.pickupFlightNumber || undefined,
        dropoffFlightNumber: data.dropoffFlightNumber || undefined,
      });
      // Payments enabled → parent moves to PaymentStep with the
      // clientSecret. Payments disabled → fall back to the legacy
      // "navigate straight to booking detail" flow.
      if (payment) {
        onBookingCreated(booking.id, payment);
        return;
      }
      clearBookingDraft();
      toast.success("Booking confirmed");
      navigate(`/bookings/${booking.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Booking failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-[22px] font-bold leading-none tracking-[-0.03em] text-[var(--color-dark)]">
        Review and book
      </h2>

      <div className="page-card p-5 space-y-3">
        <div className="data-pair">
          <span>PICKUP</span>
          <span
            className="max-w-[65%] truncate text-right"
            title={data.pickupAddress}
          >
            {shortAddress(data.pickupAddress)}
          </span>
        </div>
        <div className="data-pair">
          <span>DROPOFF</span>
          <span
            className="max-w-[65%] truncate text-right"
            title={data.dropoffAddress}
          >
            {shortAddress(data.dropoffAddress)}
          </span>
        </div>
        <div className="card-divider" />
        <div className="data-pair">
          <span>WHEN</span>
          <span>{formatDate(scheduledDate)}</span>
        </div>
        <div className="data-pair">
          <span>VEHICLE</span>
          <span className="uppercase">{data.vehicleClass}</span>
        </div>
        {data.pickupFlightNumber && (
          <div className="data-pair">
            <span>ARRIVING FLIGHT</span>
            <span>{data.pickupFlightNumber}</span>
          </div>
        )}
        {data.dropoffFlightNumber && (
          <div className="data-pair">
            <span>DEPARTING FLIGHT</span>
            <span>{data.dropoffFlightNumber}</span>
          </div>
        )}
        <div className="card-divider" />
        <div className="data-pair">
          <span>FARE</span>
          <span>{formatPrice(data.pricePence)}</span>
        </div>
        {data.discountPence > 0 && (
          <div className="data-pair">
            <span>DISCOUNT ({data.couponCode})</span>
            <span>-{formatPrice(data.discountPence)}</span>
          </div>
        )}
        <div className="card-divider" />
        <div className="data-pair">
          <span>TOTAL</span>
          <span className="text-[22px] font-bold tracking-[-0.02em]">
            {formatPrice(data.finalPricePence)}
          </span>
        </div>
        {data.isAirport && (
          <div className="pt-2">
            <span className="ds-tag tag-airport">AIRPORT TRANSFER</span>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          disabled={submitting}
          className="btn-secondary flex-1"
        >
          <span>Back</span>
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="btn-green flex-1"
        >
          <span>
            {submitting ? "Holding slot…" : "Continue to payment"}
          </span>
          <span className="btn-icon" aria-hidden="true">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="subtle-link mx-auto block pt-2"
      >
        Start over
      </button>
    </div>
  );
}
