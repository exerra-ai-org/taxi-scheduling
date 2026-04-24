import { useState } from "react";
import type { Booking } from "shared/types";
import { updateBooking } from "../api/bookings";
import { ApiError } from "../api/client";

interface Props {
  booking: Booking;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditBookingModal({ booking, onClose, onSaved }: Props) {
  const scheduledDate = new Date(booking.scheduledAt);
  const localDate = scheduledDate.toLocaleDateString("en-CA"); // YYYY-MM-DD
  const localTime = scheduledDate.toTimeString().slice(0, 5); // HH:MM

  const [date, setDate] = useState(localDate);
  const [time, setTime] = useState(localTime);
  const [pickupFlight, setPickupFlight] = useState(
    booking.pickupFlightNumber || "",
  );
  const [dropoffFlight, setDropoffFlight] = useState(
    booking.dropoffFlightNumber || "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isPickupAirport =
    booking.isAirport && booking.pickupFlightNumber !== undefined;
  const isDropoffAirport =
    booking.isAirport && booking.dropoffFlightNumber !== undefined;
  const showFlights = booking.isAirport;

  async function handleSave() {
    setLoading(true);
    setError("");
    try {
      const scheduledAt = new Date(`${date}T${time}`).toISOString();
      await updateBooking(booking.id, {
        scheduledAt,
        pickupFlightNumber: showFlights ? pickupFlight || null : undefined,
        dropoffFlightNumber: showFlights ? dropoffFlight || null : undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update booking",
      );
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="glass-card relative w-full max-w-md space-y-4 p-6 animate-scale-in">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--color-dark)]">
            Edit Booking
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:text-[var(--color-dark)]"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div className="mono-label text-xs text-[var(--color-muted)]">
            Ride #{booking.id} · {booking.pickupAddress} →{" "}
            {booking.dropoffAddress}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label mb-1 block">Date</label>
              <input
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
                className="input-glass w-full"
              />
            </div>
            <div>
              <label className="field-label mb-1 block">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="input-glass w-full"
              />
            </div>
          </div>

          {showFlights && (
            <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
              <div>
                <label className="field-label mb-1 block">
                  Arriving flight{" "}
                  <span className="text-[var(--color-muted)]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={pickupFlight}
                  onChange={(e) =>
                    setPickupFlight(e.target.value.toUpperCase())
                  }
                  placeholder="e.g. BA123"
                  maxLength={10}
                  className="input-glass w-full"
                />
              </div>
              <div>
                <label className="field-label mb-1 block">
                  Departing flight{" "}
                  <span className="text-[var(--color-muted)]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={dropoffFlight}
                  onChange={(e) =>
                    setDropoffFlight(e.target.value.toUpperCase())
                  }
                  placeholder="e.g. BA456"
                  maxLength={10}
                  className="input-glass w-full"
                />
              </div>
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
