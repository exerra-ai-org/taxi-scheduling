import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Booking, BookingStatus, DriverLocation } from "shared/types";
import {
  cancelBooking,
  getBooking,
  getDriverLocation,
  type BookingDetail,
} from "../api/bookings";
import { ApiError } from "../api/client";
import {
  formatDate,
  formatPrice,
  statusColor,
  statusLabel,
} from "../lib/format";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmDialog from "../components/ConfirmDialog";
import { RideDetailSkeleton } from "../components/Skeleton";
import {
  IconClock,
  IconUser,
  IconCar,
  IconPhone,
  IconCheck,
  IconArrowLeft,
  IconPlane,
  IconStar,
  IconEdit,
  IconX,
} from "../components/icons";
import MapBackdrop, { type Coords } from "./booking/MapBackdrop";
import ReviewForm from "./ReviewForm";

const TRACKABLE: BookingStatus[] = ["assigned", "en_route", "arrived"];
const POLL_MS = 8000;

const TIMELINE: { key: BookingStatus; label: string }[] = [
  { key: "scheduled", label: "Booked" },
  { key: "assigned", label: "Driver assigned" },
  { key: "en_route", label: "En route" },
  { key: "arrived", label: "Driver arrived" },
  { key: "completed", label: "Completed" },
];

function timelineIndex(status: BookingStatus): number {
  if (status === "cancelled") return -1;
  return TIMELINE.findIndex((s) => s.key === status);
}

function shortName(addr: string): string {
  if (!addr) return "";
  return addr.split(",")[0].trim();
}


interface CustomerBookingExtra extends Booking {
  hasReview?: boolean;
}

export default function CustomerRideDetail() {
  const { id } = useParams<{ id: string }>();
  const bookingId = id ? Number(id) : NaN;
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialogProps } = useConfirm();

  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [driverLoc, setDriverLoc] = useState<DriverLocation | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(bookingId)) return;
    try {
      const data = await getBooking(bookingId);
      setDetail(data);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load booking");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onFocus() {
      load();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const booking = detail?.booking as CustomerBookingExtra | undefined;
  const primaryAssignment = useMemo(
    () => detail?.assignments.find((a) => a.role === "primary" && a.isActive),
    [detail],
  );

  const trackable = !!booking && TRACKABLE.includes(booking.status);
  const pickup: Coords | null =
    booking?.pickupLat != null && booking?.pickupLon != null
      ? { lat: booking.pickupLat, lon: booking.pickupLon }
      : null;
  const dropoff: Coords | null =
    booking?.dropoffLat != null && booking?.dropoffLon != null
      ? { lat: booking.dropoffLat, lon: booking.dropoffLon }
      : null;
  const driver: Coords | null =
    driverLoc?.lat != null && driverLoc?.lon != null
      ? { lat: driverLoc.lat, lon: driverLoc.lon }
      : null;

  // Poll driver location while trackable
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!trackable || !Number.isFinite(bookingId)) return;
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        try {
          const loc = await getDriverLocation(bookingId);
          if (!cancelled) setDriverLoc(loc);
        } catch {
          /* keep last-known on transient error */
        }
      }
      pollRef.current = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [bookingId, trackable]);

  // Panel measurement so the fitted route reserves room for the floating panel
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!panelRef.current) return;
    const ro = new ResizeObserver(() => {
      if (panelRef.current) {
        setPanelSize({
          width: panelRef.current.offsetWidth,
          height: panelRef.current.offsetHeight,
        });
      }
    });
    ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, []);

  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 810px)").matches;
  const obstruct = isDesktop
    ? { top: 80, left: 60, right: panelSize.width + 48, bottom: 60 }
    : { top: 60, left: 40, right: 40, bottom: panelSize.height + 32 };

  async function handleCancel() {
    if (!booking) return;
    const ok = await confirm({
      title: "Cancel booking",
      message: "This cannot be undone. Continue?",
      confirmLabel: "Cancel ride",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await cancelBooking(booking.id);
      toast.success("Booking cancelled");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not cancel");
    }
  }

  if (loading && !detail) {
    return (
      <div className="fixed inset-0 top-[72px] overflow-hidden">
        <MapBackdrop pickup={null} dropoff={null} obstruct={obstruct} />
        <div
          className="floating-panel booking-flow-panel"
          data-anchor="right"
        >
          <div className="booking-flow-panel-inner" aria-busy="true">
            <RideDetailSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (error || !detail || !booking) {
    return (
      <div className="fixed inset-0 top-[72px] flex items-center justify-center">
        <div className="page-card max-w-md p-6 space-y-4">
          <div className="alert alert-error" role="alert">
            {error || "Booking not found"}
          </div>
          <button
            onClick={() => navigate("/bookings")}
            className="btn-secondary w-full"
          >
            <span>← Back to bookings</span>
          </button>
        </div>
      </div>
    );
  }

  const tIdx = timelineIndex(booking.status);
  const isCancelled = booking.status === "cancelled";
  const canEdit = booking.status === "scheduled" || booking.status === "assigned";
  const canReview = booking.status === "completed" && !booking.hasReview;

  return (
    <div className="fixed inset-0 top-[72px] overflow-hidden">
      <MapBackdrop
        pickup={pickup}
        dropoff={dropoff}
        driver={driver}
        obstruct={obstruct}
        interactive
      />

      <div
        ref={panelRef}
        className="floating-panel booking-flow-panel"
        data-anchor="right"
      >
        <div className="booking-flow-panel-inner">
        <div className="ride-detail animate-fade-in">
          {/* Top row: back link + (live dot) + airport chip + status pill */}
          <div className="ride-detail-topbar">
            <Link
              to="/bookings"
              className="subtle-link inline-flex items-center gap-1.5"
            >
              <IconArrowLeft className="h-3.5 w-3.5" />
              <span>All rides</span>
            </Link>
            <div className="flex items-center gap-2">
              {trackable && driver && (
                <span
                  className="ride-detail-live-dot"
                  aria-label="Live driver location"
                  title={
                    driverLoc?.lastUpdatedAt
                      ? `Updated ${new Date(driverLoc.lastUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                      : "Live"
                  }
                />
              )}
              {booking.isAirport && (
                <span className="ds-tag tag-airport inline-flex items-center gap-1">
                  <IconPlane className="h-3 w-3" />
                  AIRPORT
                </span>
              )}
              <span className={`status-pill ${statusColor(booking.status)}`}>
                {statusLabel(booking.status)}
              </span>
            </div>
          </div>

          {/* Hero: eyebrow + two-line route block (P/D markers mirror the
              map pins) + scheduled meta. */}
          <div className="ride-detail-hero">
            <p className="page-eyebrow">/ Ride #{booking.id}</p>
            <div className="ride-detail-route">
              <div className="ride-detail-route-row">
                <span
                  className="ride-detail-route-marker is-pickup"
                  aria-hidden="true"
                >
                  P
                </span>
                <h1 className="ride-detail-route-text">
                  {shortName(booking.pickupAddress)}
                </h1>
              </div>
              <div
                className="ride-detail-route-spine"
                aria-hidden="true"
              />
              <div className="ride-detail-route-row">
                <span
                  className="ride-detail-route-marker is-dropoff"
                  aria-hidden="true"
                >
                  D
                </span>
                <h2 className="ride-detail-route-text">
                  {shortName(booking.dropoffAddress)}
                </h2>
              </div>
            </div>
            <div className="ride-detail-meta">
              <IconClock className="h-3.5 w-3.5" />
              {formatDate(booking.scheduledAt)}
            </div>
          </div>

          {/* Driver */}
          <section>
            <p className="section-label">Driver</p>
            {primaryAssignment ? (
              <div className="ride-detail-driver">
                <span className="ride-detail-driver-chip">
                  <IconUser className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="ride-detail-driver-name">
                    {primaryAssignment.driverName}
                  </div>
                  {detail.vehicle && (
                    <div className="caption-copy">
                      {detail.vehicle.name} · {detail.vehicle.passengerCapacity}{" "}
                      pax
                    </div>
                  )}
                </div>
                {primaryAssignment.driverPhone && (
                  <a
                    href={`tel:${primaryAssignment.driverPhone}`}
                    className="ride-detail-driver-call"
                    aria-label={`Call ${primaryAssignment.driverName}`}
                  >
                    <IconPhone className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : (
              <div className="caption-copy inline-flex items-center gap-2 py-1">
                <IconCar className="h-4 w-4" />
                Awaiting driver assignment.
              </div>
            )}
          </section>

          {/* Horizontal timeline. Per-step labels collapse into one shared
              label below that swaps to the active step. */}
          <section>
            <p className="section-label">Progress</p>
            <ol className="ride-detail-timeline" aria-label="Ride progress">
              {TIMELINE.map(({ key }, i) => {
                const isComplete = i < tIdx;
                const isActive = i === tIdx;
                const isLast = i === TIMELINE.length - 1;
                return (
                  <li key={key} className="ride-detail-timeline-step">
                    <div
                      className={`ride-detail-timeline-dot ${
                        isComplete
                          ? "is-complete"
                          : isActive
                            ? "is-active"
                            : ""
                      }`}
                      aria-current={isActive ? "step" : undefined}
                    >
                      {isComplete ? <IconCheck className="h-3 w-3" /> : i + 1}
                    </div>
                    {!isLast && (
                      <div
                        className={`ride-detail-timeline-line ${
                          isComplete ? "is-complete" : ""
                        }`}
                        aria-hidden="true"
                      />
                    )}
                  </li>
                );
              })}
            </ol>
            {tIdx >= 0 && (
              <div
                key={TIMELINE[tIdx]?.key}
                className="ride-detail-timeline-current animate-fade-in"
              >
                {TIMELINE[tIdx]?.label}
              </div>
            )}
            {isCancelled && (
              <div className="alert alert-error mt-2 text-[13px]">
                This booking was cancelled.
              </div>
            )}
          </section>

          {/* Details */}
          <section>
            <p className="section-label">Details</p>
            <dl className="ride-detail-grid">
              <div className="ride-detail-grid-cell">
                <dt>VEHICLE</dt>
                <dd className="capitalize">{booking.vehicleClass}</dd>
              </div>
              {booking.distanceMiles != null && (
                <div className="ride-detail-grid-cell">
                  <dt>DISTANCE</dt>
                  <dd>{booking.distanceMiles.toFixed(1)} mi</dd>
                </div>
              )}
              {booking.pickupFlightNumber && (
                <div className="ride-detail-grid-cell">
                  <dt className="inline-flex items-center gap-1">
                    <IconPlane className="h-3 w-3" />
                    ARRIVING
                  </dt>
                  <dd>{booking.pickupFlightNumber}</dd>
                </div>
              )}
              {booking.dropoffFlightNumber && (
                <div className="ride-detail-grid-cell">
                  <dt className="inline-flex items-center gap-1">
                    <IconPlane className="h-3 w-3" />
                    DEPARTING
                  </dt>
                  <dd>{booking.dropoffFlightNumber}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Total: flat row, hairline above */}
          <div className="ride-detail-total">
            <div>
              <div className="mono-label">Total</div>
              {booking.discountPence > 0 && (
                <div className="caption-copy text-[12px]">
                  Saved {formatPrice(booking.discountPence)}
                </div>
              )}
            </div>
            <div className="ride-detail-total-amount tabular-nums">
              {formatPrice(booking.pricePence)}
            </div>
          </div>

          {/* Actions */}
          <div className="ride-detail-actions">
            {canReview && (
              <button
                onClick={() => setReviewOpen(true)}
                className="btn-green w-full"
              >
                <span className="inline-flex items-center gap-2">
                  <IconStar className="h-4 w-4" />
                  Leave a review
                </span>
                <span className="btn-icon" aria-hidden="true">
                  <span className="btn-icon-glyph">↗</span>
                </span>
              </button>
            )}
            {canEdit && (
              <div className="flex gap-2">
                <button
                  onClick={() => toast.info("Edit coming soon")}
                  className="btn-secondary flex-1"
                >
                  <span className="inline-flex items-center gap-2">
                    <IconEdit className="h-4 w-4" />
                    Edit
                  </span>
                </button>
                <button onClick={handleCancel} className="btn-ghost flex-1">
                  <span className="inline-flex items-center gap-2 text-[var(--color-error)]">
                    <IconX className="h-4 w-4" />
                    Cancel
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      <ReviewForm
        bookingId={reviewOpen ? booking.id : null}
        onClose={() => {
          setReviewOpen(false);
          load();
        }}
      />
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
