import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Booking, Vehicle, BookingStatus } from "shared/types";
import { getBooking, cancelBooking } from "../api/bookings";
import EditBookingModal from "../components/EditBookingModal";
import {
  formatPrice,
  formatDate,
  statusLabel,
  statusColor,
} from "../lib/format";
import { IconMapPin } from "../components/icons";
import { SkeletonCard } from "../components/Skeleton";
import ConfirmDialog from "../components/ConfirmDialog";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../context/ToastContext";
import ReviewForm from "./ReviewForm";
import LiveDriverMap from "../components/maps/LiveDriverMap";
import RouteMap from "../components/maps/RouteMap";

interface Assignment {
  id: number;
  driverId: number;
  role: string;
  isActive: boolean;
  assignedAt: string;
  driverName: string;
  driverPhone: string;
}

const STATUS_FLOW: BookingStatus[] = [
  "scheduled",
  "assigned",
  "en_route",
  "arrived",
  "completed",
];

const STATUS_ICONS: Record<string, string> = {
  scheduled: "📋",
  assigned: "👤",
  en_route: "🚗",
  arrived: "📍",
  completed: "✅",
};

export default function CustomerRideDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialogProps } = useConfirm();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewBookingId, setReviewBookingId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getBooking(Number(id));
      setBooking(data.booking);
      setAssignments(data.assignments);
      setVehicle(data.vehicle ?? null);
    } catch {
      toast.error("Failed to load booking");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleCancel() {
    if (!booking) return;
    const ok = await confirm({
      title: "Cancel Booking",
      message: "Are you sure you want to cancel this booking?",
      confirmLabel: "Cancel Booking",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await cancelBooking(booking.id);
      toast.success("Booking cancelled");
      fetchData();
    } catch {
      toast.error("Failed to cancel booking");
    }
  }

  function handleRebook() {
    if (!booking) return;
    navigate("/", {
      state: {
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
      },
    });
  }

  if (loading) {
    return (
      <div className="page-stack">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="page-stack">
        <div className="alert alert-error">Booking not found</div>
        <button onClick={() => navigate("/bookings")} className="btn-secondary">
          Back to Bookings
        </button>
      </div>
    );
  }

  const primaryDriver = assignments.find(
    (a) => a.role === "primary" && a.isActive,
  );
  const isCancelled = booking.status === "cancelled";
  const isActive = ["assigned", "en_route", "arrived"].includes(booking.status);
  const showLiveMap =
    ["en_route", "arrived"].includes(booking.status) &&
    booking.pickupLat != null &&
    booking.dropoffLat != null;
  const showStaticMap =
    !showLiveMap &&
    booking.pickupLat != null &&
    booking.pickupLon != null &&
    booking.dropoffLat != null &&
    booking.dropoffLon != null;
  const canCancel = ["scheduled", "assigned"].includes(booking.status);

  const statusIdx = STATUS_FLOW.indexOf(booking.status as BookingStatus);

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="page-header">
        <div>
          <button
            onClick={() => navigate("/bookings")}
            className="subtle-link mb-2 inline-block"
          >
            &larr; All Bookings
          </button>
          <h1 className="page-title text-[32px]">Ride #{booking.id}</h1>
        </div>
        <span className={`status-pill ${statusColor(booking.status)}`}>
          {statusLabel(booking.status)}
        </span>
      </div>

      {/* Status Timeline */}
      {!isCancelled && (
        <div className="glass-card p-4">
          <h3 className="field-label mb-3">Ride Status</h3>
          <div className="flex items-center gap-1">
            {STATUS_FLOW.map((s, i) => {
              const isPast = i < statusIdx;
              const isCurrent = i === statusIdx;
              const isFuture = i > statusIdx;
              return (
                <div
                  key={s}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all ${
                      isCurrent
                        ? "bg-[var(--color-green)] text-white scale-110 shadow-md"
                        : isPast
                          ? "bg-[var(--color-forest)] text-white"
                          : "bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)]"
                    }`}
                  >
                    {isPast ? "✓" : STATUS_ICONS[s]}
                  </div>
                  <span
                    className={`mono-label text-[10px] text-center ${
                      isCurrent
                        ? "text-[var(--color-dark)] font-bold"
                        : isFuture
                          ? "text-[var(--color-muted)]"
                          : ""
                    }`}
                  >
                    {statusLabel(s)}
                  </span>
                  {i < STATUS_FLOW.length - 1 && (
                    <div
                      className={`hidden ${isPast ? "bg-[var(--color-forest)]" : "bg-[var(--color-border)]"}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Map or Static Map */}
      {showLiveMap && (
        <LiveDriverMap
          bookingId={booking.id}
          pickup={{ lat: booking.pickupLat!, lon: booking.pickupLon! }}
          dropoff={{ lat: booking.dropoffLat!, lon: booking.dropoffLon! }}
        />
      )}
      {showStaticMap && (
        <RouteMap
          pickup={{ lat: booking.pickupLat!, lon: booking.pickupLon! }}
          dropoff={{ lat: booking.dropoffLat!, lon: booking.dropoffLon! }}
        />
      )}

      {/* Driver Card */}
      {primaryDriver && isActive && (
        <div className="glass-card p-4">
          <h3 className="field-label mb-3">Your Driver</h3>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-forest)] text-xl font-bold text-white shrink-0">
              {primaryDriver.driverName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-[var(--color-dark)]">
                {primaryDriver.driverName}
              </div>
              {primaryDriver.driverPhone && (
                <div className="mono-label mt-0.5">
                  {primaryDriver.driverPhone}
                </div>
              )}
            </div>
            {primaryDriver.driverPhone && (
              <a
                href={`tel:${primaryDriver.driverPhone}`}
                className="btn-secondary shrink-0 flex items-center gap-1.5"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                Call
              </a>
            )}
          </div>
        </div>
      )}

      {/* Vehicle Card */}
      {vehicle && (
        <div className="glass-card p-4">
          <h3 className="field-label mb-3">Vehicle</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-bold text-[var(--color-dark)]">
                {vehicle.name}
              </div>
              {vehicle.description && (
                <p className="caption-copy text-sm mt-0.5">
                  {vehicle.description}
                </p>
              )}
              <div className="flex items-center gap-4 mt-2">
                <span className="mono-label flex items-center gap-1">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  {vehicle.passengerCapacity} seats
                </span>
                <span className="mono-label flex items-center gap-1">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
                  </svg>
                  {vehicle.baggageCapacity} bags
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Booking Details */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="field-label">Journey Details</h3>
        <div className="flex items-start gap-2">
          <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-forest)]" />
          <div>
            <span className="mono-label text-[10px]">PICKUP</span>
            <div className="body-copy text-sm">{booking.pickupAddress}</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-dark)]" />
          <div>
            <span className="mono-label text-[10px]">DROP-OFF</span>
            <div className="body-copy text-sm">{booking.dropoffAddress}</div>
          </div>
        </div>
        <div className="card-divider" />
        <div className="data-pair">
          <span>Date & Time</span>
          <span>{formatDate(booking.scheduledAt)}</span>
        </div>
        {booking.distanceMiles != null && (
          <div className="data-pair">
            <span>Distance</span>
            <span>{booking.distanceMiles.toFixed(1)} miles</span>
          </div>
        )}
        <div className="card-divider" />
        <div className="data-pair">
          <span>Price</span>
          <span className="font-bold">{formatPrice(booking.pricePence)}</span>
        </div>
        {booking.discountPence > 0 && (
          <div className="data-pair">
            <span>Discount</span>
            <span className="text-[var(--color-forest)]">
              -{formatPrice(booking.discountPence)}
            </span>
          </div>
        )}
        {booking.isAirport && (
          <div className="space-y-1">
            <span className="ds-tag tag-airport">AIRPORT TRANSFER</span>
            {booking.pickupFlightNumber && (
              <div className="mono-label text-xs">
                ✈ Arriving: {booking.pickupFlightNumber}
              </div>
            )}
            {booking.dropoffFlightNumber && (
              <div className="mono-label text-xs">
                ✈ Departing: {booking.dropoffFlightNumber}
              </div>
            )}
            {!booking.pickupFlightNumber &&
              !booking.dropoffFlightNumber &&
              booking.flightNumber && (
                <div className="mono-label text-xs">
                  ✈ {booking.flightNumber}
                </div>
              )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {canCancel && (
          <button
            onClick={handleCancel}
            className="btn-secondary flex-1 text-[var(--color-error)]"
          >
            Cancel
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => setEditOpen(true)}
            className="btn-secondary flex-1"
          >
            Edit
          </button>
        )}
        <button onClick={handleRebook} className="btn-secondary flex-1">
          Rebook
        </button>
        {booking.status === "completed" && !(booking as any).hasReview && (
          <button
            onClick={() => setReviewBookingId(booking.id)}
            className="btn-primary flex-1"
          >
            Leave Review
          </button>
        )}
      </div>

      <ReviewForm
        bookingId={reviewBookingId}
        onClose={() => setReviewBookingId(null)}
        onSubmitted={fetchData}
      />
      {dialogProps && <ConfirmDialog {...dialogProps} />}
      {editOpen && booking && (
        <EditBookingModal
          booking={booking}
          onClose={() => setEditOpen(false)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
