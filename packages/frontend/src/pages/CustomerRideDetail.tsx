import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeEvent } from "../context/RealtimeContext";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Booking, BookingStatus, DriverLocation } from "shared/types";
import {
  cancelBooking,
  getBooking,
  reportIncident,
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

const TRACKABLE: BookingStatus[] = [
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
];
const TIMELINE: { key: BookingStatus; label: string }[] = [
  { key: "scheduled", label: "Your ride has been booked" },
  { key: "assigned", label: "Driver has been assigned" },
  { key: "en_route", label: "Driver is en route to you" },
  { key: "arrived", label: "Driver has arrived and is waiting" },
  { key: "in_progress", label: "Your ride is in progress" },
  { key: "completed", label: "The ride has been completed" },
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

// ── Incident modal ────────────────────────────────────────────────────────────

interface IncidentModalProps {
  type: "emergency" | "contact_admin";
  onClose: () => void;
  onSubmit: (message: string) => Promise<void>;
}

function IncidentModal({ type, onClose, onSubmit }: IncidentModalProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await onSubmit(message.trim());
      setDone(true);
    } finally {
      setSending(false);
    }
  }

  const isEmergency = type === "emergency";

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-card w-full max-w-sm space-y-4 p-5 animate-fade-in">
        {done ? (
          <>
            <div className="flex items-center gap-2">
              <IconCheck className="h-5 w-5 text-[var(--color-forest)]" />
              <p className="section-label">
                {isEmergency ? "Emergency alert sent" : "Message sent to admin"}
              </p>
            </div>
            <p className="caption-copy text-[var(--color-mid)]">
              {isEmergency
                ? "Our team has been notified immediately and will respond as soon as possible."
                : "An admin has been notified and will follow up shortly."}
            </p>
            <button onClick={onClose} className="btn-primary w-full">
              Done
            </button>
          </>
        ) : (
          <>
            <div>
              <p className="section-label">
                {isEmergency ? "/ Emergency alert" : "/ Contact admin"}
              </p>
              <p className="caption-copy mt-2 text-[var(--color-mid)]">
                {isEmergency
                  ? "This will immediately notify our team. Use for safety emergencies, accidents, or urgent issues."
                  : "Send a message to our admin team about this ride."}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="form-group">
                <label className="form-label">
                  {isEmergency
                    ? "Describe the emergency (optional)"
                    : "Your message (optional)"}
                </label>
                <textarea
                  className="form-input resize-none"
                  rows={3}
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    isEmergency
                      ? "e.g. vehicle breakdown, unsafe driving…"
                      : "e.g. running late, need to change pickup point…"
                  }
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary flex-1"
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className={`flex-1 ${isEmergency ? "btn-danger" : "btn-primary"}`}
                >
                  {sending
                    ? "Sending…"
                    : isEmergency
                      ? "Send emergency alert"
                      : "Send message"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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

  // Map controls
  const [followDriver, setFollowDriver] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);

  // Help & incident modal
  const [helpOpen, setHelpOpen] = useState(false);
  const [incidentType, setIncidentType] = useState<
    "emergency" | "contact_admin" | null
  >(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(bookingId)) return;
    try {
      const data = await getBooking(bookingId);
      setDetail(data);
      setError("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load booking",
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent("booking_updated", (e) => {
    if (e.bookingId === bookingId) load();
  });
  useRealtimeEvent("drivers_assigned", (e) => {
    if (e.bookingId === bookingId) load();
  });
  useRealtimeEvent("booking_cancelled", (e) => {
    if (e.bookingId === bookingId) load();
  });

  const booking = detail?.booking as CustomerBookingExtra | undefined;
  const primaryAssignment = useMemo(
    () => detail?.assignments.find((a) => a.role === "primary" && a.isActive),
    [detail],
  );

  const trackable = !!booking && TRACKABLE.includes(booking.status);
  const isOngoing = booking?.status === "en_route";
  const isArrived = booking?.status === "arrived";
  const isInProgress = booking?.status === "in_progress";
  const isActiveRide = isOngoing || isArrived || isInProgress;

  // Enable follow-driver automatically when ride is en_route or in_progress
  useEffect(() => {
    if (isOngoing || isInProgress) setFollowDriver(true);
    else setFollowDriver(false);
  }, [isOngoing, isInProgress]);

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

  useRealtimeEvent("driver_location", (e) => {
    if (e.bookingId === bookingId) {
      setDriverLoc((prev) => ({
        lat: e.lat,
        lon: e.lon,
        lastUpdatedAt: e.updatedAt,
        // distanceMiles comes from the REST endpoint; preserve the last
        // value until the next refetch.
        distanceMiles: prev?.distanceMiles ?? null,
      }));
    }
  });

  // Panel measurement for map obstruct padding
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!panelRef.current) return;
    const ro = new ResizeObserver(() => {
      if (panelRef.current)
        setPanelSize({
          width: panelRef.current.offsetWidth,
          height: panelRef.current.offsetHeight,
        });
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

  async function handleIncident(message: string) {
    if (!incidentType || !booking) return;
    try {
      await reportIncident(booking.id, incidentType, message || undefined);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not send report",
      );
      throw err;
    }
  }

  if (loading && !detail) {
    return (
      <div className="fixed inset-0 top-[72px] overflow-hidden">
        <MapBackdrop pickup={null} dropoff={null} obstruct={obstruct} />
        <div className="floating-panel booking-flow-panel" data-anchor="right">
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
            ← Back to bookings
          </button>
        </div>
      </div>
    );
  }

  const tIdx = timelineIndex(booking.status);
  const isCancelled = booking.status === "cancelled";
  const canEdit =
    booking.status === "scheduled" || booking.status === "assigned";
  const canReview =
    booking.status === "completed" && !detail?.review && !booking.hasReview;

  return (
    <div className="fixed inset-0 top-[72px] overflow-hidden">
      <MapBackdrop
        pickup={pickup}
        dropoff={dropoff}
        driver={driver}
        obstruct={obstruct}
        interactive
        followDriver={followDriver}
        fitTrigger={fitTrigger}
      />

      {/* Map controls overlay — follow / show-route toggles */}
      {trackable && (pickup || driver) && (
        <div className="absolute top-4 left-4 z-[400] flex flex-col gap-1.5">
          {driver && (
            <button
              onClick={() => setFollowDriver((v) => !v)}
              className={`map-control-btn ${followDriver ? "map-control-btn-active" : ""}`}
              title={followDriver ? "Stop following driver" : "Follow driver"}
            >
              {followDriver ? "Following" : "Follow"}
            </button>
          )}
          {pickup && dropoff && (
            <button
              onClick={() => {
                setFollowDriver(false);
                setFitTrigger((n) => n + 1);
              }}
              className="map-control-btn"
              title="Show full route"
            >
              Full route
            </button>
          )}
        </div>
      )}

      <div
        ref={panelRef}
        className="floating-panel booking-flow-panel"
        data-anchor="right"
      >
        <div className="booking-flow-panel-inner">
          <div className="ride-detail animate-fade-in">
            {/* Top row */}
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

            {/* Hero */}
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
                <div className="ride-detail-route-spine" aria-hidden="true" />
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

            {/* ── RIDE IN PROGRESS banner ── */}
            {isActiveRide && (
              <section
                className={`rounded-xl p-4 space-y-3 ${
                  isInProgress
                    ? "bg-[color-mix(in_srgb,var(--color-navy)_12%,transparent)]"
                    : isOngoing
                      ? "bg-[color-mix(in_srgb,var(--color-forest)_12%,transparent)]"
                      : "bg-[color-mix(in_srgb,var(--color-orange)_12%,transparent)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isOngoing || isInProgress ? (
                      <span
                        className="ride-detail-live-dot"
                        style={{ width: 10, height: 10 }}
                      />
                    ) : (
                      <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-orange)]" />
                    )}
                    <p className="section-label">
                      {isInProgress
                        ? "Ride in progress"
                        : isOngoing
                          ? "Driver is on the way"
                          : "Driver has arrived"}
                    </p>
                  </div>
                  <button
                    onClick={() => setHelpOpen(true)}
                    className="btn-ghost text-xs py-1.5 px-3"
                  >
                    Need help?
                  </button>
                </div>

                {isOngoing && driverLoc?.distanceMiles != null && (
                  <p className="caption-copy text-[var(--color-mid)]">
                    {driverLoc.distanceMiles < 0.1
                      ? "Driver is very close to your pickup point"
                      : `Driver is ${driverLoc.distanceMiles.toFixed(1)} mi from pickup`}
                  </p>
                )}

                {isArrived && (
                  <p className="caption-copy text-[var(--color-mid)]">
                    Your driver is waiting at the pickup point.
                  </p>
                )}

                {isInProgress && (
                  <p className="caption-copy text-[var(--color-mid)]">
                    You are on your way to the destination.
                  </p>
                )}
              </section>
            )}

            {/* Driver */}
            <section>
              <p className="section-label">Driver</p>
              {primaryAssignment ? (
                <div className="space-y-3">
                  <div className="ride-detail-driver">
                    {primaryAssignment.driverProfilePicture ? (
                      <img
                        src={primaryAssignment.driverProfilePicture}
                        alt={primaryAssignment.driverName}
                        className="h-10 w-10 rounded-full object-cover shrink-0 border border-[var(--color-border)]"
                      />
                    ) : (
                      <span className="ride-detail-driver-chip">
                        <IconUser className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="ride-detail-driver-name">
                        {primaryAssignment.driverName}
                      </div>
                      {primaryAssignment.avgRating != null && (
                        <div className="caption-copy inline-flex items-center gap-1 mt-0.5">
                          <IconStar className="h-3 w-3 text-yellow-400" />
                          <span>{primaryAssignment.avgRating}</span>
                          <span className="text-[var(--color-muted)]">
                            ({primaryAssignment.totalReviews})
                          </span>
                        </div>
                      )}
                      {trackable &&
                        driverLoc?.distanceMiles != null &&
                        !isActiveRide && (
                          <div className="caption-copy mt-0.5 inline-flex items-center gap-1">
                            <span
                              className="ride-detail-live-dot"
                              style={{ width: 6, height: 6 }}
                            />
                            {driverLoc.distanceMiles < 0.1
                              ? "Arriving now"
                              : `${driverLoc.distanceMiles.toFixed(1)} mi away`}
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
                  {primaryAssignment.driverProfile && (
                    <div className="glass-card p-3 space-y-1">
                      <div className="flex items-center gap-2 caption-copy text-[var(--color-mid)]">
                        <IconCar className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium">
                          {[
                            primaryAssignment.driverProfile.vehicleYear,
                            primaryAssignment.driverProfile.vehicleMake,
                            primaryAssignment.driverProfile.vehicleModel,
                          ]
                            .filter(Boolean)
                            .join(" ") || "Vehicle on file"}
                        </span>
                        {primaryAssignment.driverProfile.vehicleColor && (
                          <span className="text-[var(--color-muted)]">
                            · {primaryAssignment.driverProfile.vehicleColor}
                          </span>
                        )}
                      </div>
                      {primaryAssignment.driverProfile.licensePlate && (
                        <div className="mono-label pl-5">
                          {primaryAssignment.driverProfile.licensePlate}
                        </div>
                      )}
                      {primaryAssignment.driverProfile.bio && (
                        <p className="caption-copy pt-1 text-[var(--color-mid)]">
                          {primaryAssignment.driverProfile.bio}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="caption-copy inline-flex items-center gap-2 py-1">
                  <IconCar className="h-4 w-4" />
                  Awaiting driver assignment.
                </div>
              )}
            </section>

            {/* Timeline */}
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
                        className={`ride-detail-timeline-dot ${isComplete ? "is-complete" : isActive ? "is-active" : ""}`}
                        aria-current={isActive ? "step" : undefined}
                      >
                        {isComplete ? <IconCheck className="h-3 w-3" /> : i + 1}
                      </div>
                      {!isLast && (
                        <div
                          className={`ride-detail-timeline-line ${isComplete ? "is-complete" : ""}`}
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

            {/* Total */}
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

            {/* Your review */}
            {booking.status === "completed" && detail?.review && (
              <section>
                <p className="section-label">Your review</p>
                <div className="glass-card p-4 space-y-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <IconStar
                        key={i}
                        className={`h-4 w-4 ${i < Number(detail.review!.rating) ? "text-yellow-400" : "text-[var(--color-border)]"}`}
                      />
                    ))}
                  </div>
                  {detail.review.comment && (
                    <p className="caption-copy text-[var(--color-mid)]">
                      {detail.review.comment}
                    </p>
                  )}
                  <p className="mono-label text-[11px]">
                    {formatDate(detail.review.createdAt)}
                  </p>
                </div>
              </section>
            )}

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

      {/* Help modal — choose between Contact Admin and SOS */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setHelpOpen(false);
          }}
        >
          <div className="glass-card w-full max-w-sm space-y-4 p-5 animate-fade-in">
            <p className="section-label">/ Need help?</p>
            <p className="caption-copy text-[var(--color-mid)]">
              Choose an option below.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setHelpOpen(false);
                  setIncidentType("contact_admin");
                }}
                className="btn-secondary w-full text-sm py-3"
              >
                <span className="inline-flex items-center gap-2">
                  <IconPhone className="h-4 w-4" />
                  Contact admin
                </span>
              </button>
              <button
                onClick={() => {
                  setHelpOpen(false);
                  setIncidentType("emergency");
                }}
                className="btn-danger w-full text-sm py-3"
              >
                SOS — Emergency
              </button>
            </div>
            <button
              onClick={() => setHelpOpen(false)}
              className="btn-ghost w-full text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Incident modal */}
      {incidentType && (
        <IncidentModal
          type={incidentType}
          onClose={() => setIncidentType(null)}
          onSubmit={handleIncident}
        />
      )}

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
