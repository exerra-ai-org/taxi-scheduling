import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRealtimeEvent,
  useRealtimeRecovery,
} from "../context/RealtimeContext";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Booking, BookingStatus, DriverLocation } from "shared/types";
import {
  cancelBooking,
  getBooking,
  getCancelPreview,
  reportIncident,
  markCustomerArrived,
  type BookingDetail,
} from "../api/bookings";
import {
  getPublicSettings,
  type PublicSettings,
} from "../api/settings";
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
  IconX,
} from "../components/icons";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import MapBackdrop, { type Coords } from "./booking/MapBackdrop";
import ReviewForm from "./ReviewForm";

const TRACKABLE: BookingStatus[] = [
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
];
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
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
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

// ── Arrived panel ─────────────────────────────────────────────────────────────
//
// Shown when status=arrived. Surfaces the live waiting-fee meter and the
// "I'm here" CTA that caps the meter + alerts the driver. Fee math mirrors
// the server (30 free min, then 200p per 5 min) so the user sees the same
// amount the backend will persist.

const FREE_MIN = 30;
const RATE_PENCE = 200;
const INCREMENT_MIN = 5;

interface ArrivedPanelProps {
  booking: CustomerBookingExtra;
  nowTick: number;
  onCustomerArrived: () => Promise<void>;
}

function computeFee(driverArrivedAt: Date, now: number): number {
  const minutes = (now - driverArrivedAt.getTime()) / 60_000;
  const billable = minutes - FREE_MIN;
  if (billable <= 0) return 0;
  return Math.ceil(billable / INCREMENT_MIN) * RATE_PENCE;
}

function ArrivedPanel({
  booking,
  nowTick,
  onCustomerArrived,
}: ArrivedPanelProps) {
  const driverArrived = booking.driverArrivedAt
    ? new Date(booking.driverArrivedAt)
    : null;
  const customerArrived = booking.customerArrivedAt
    ? new Date(booking.customerArrivedAt)
    : null;

  const referenceMs = customerArrived?.getTime() ?? nowTick;
  const liveFee = driverArrived ? computeFee(driverArrived, referenceMs) : 0;
  const minutesElapsed = driverArrived
    ? Math.max(0, (referenceMs - driverArrived.getTime()) / 60_000)
    : 0;
  const inFreeWindow = minutesElapsed < FREE_MIN;
  const minutesUntilCharge = Math.max(0, FREE_MIN - minutesElapsed);

  return (
    <div className="space-y-3">
      <p className="caption-copy text-[var(--color-mid)]">
        Your driver is waiting at the pickup point.
      </p>

      {driverArrived && (
        <div className="glass-card p-3">
          <p className="section-label">/ Waiting</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-[20px] font-bold tracking-[-0.02em]">
              {inFreeWindow
                ? `${minutesUntilCharge.toFixed(0)} min free`
                : `${formatPrice(liveFee)} fee`}
            </span>
            <span className="caption-copy text-[var(--color-muted)]">
              {minutesElapsed.toFixed(0)} min since arrival
            </span>
          </div>
          {!inFreeWindow && (
            <p className="caption-copy mt-1 text-[var(--color-muted)]">
              £{(RATE_PENCE / 100).toFixed(2)} per {INCREMENT_MIN} min after the
              first {FREE_MIN} min.
            </p>
          )}
        </div>
      )}

      {customerArrived ? (
        <div className="alert alert-success" role="status">
          You let the driver know you've arrived.
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void onCustomerArrived()}
          className="btn-green w-full"
        >
          <span>I'm here</span>
          <span className="btn-icon" aria-hidden="true">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
      )}
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

  // Runtime-tunable contact numbers — fetched once on mount. Admin can edit
  // these from /admin/settings; we refetch when the user opens help.
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(
    null,
  );
  useEffect(() => {
    getPublicSettings()
      .then(setPublicSettings)
      .catch(() => {});
  }, []);

  // Local "now" ticker so the waiting-fee meter advances visibly without a
  // server round-trip. The fee is still authoritatively computed server-side
  // at status flip / no-show, but the customer sees the meter live.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleCustomerArrived() {
    if (!bookingId) return;
    try {
      await markCustomerArrived(bookingId);
      toast.success("Driver has been notified");
      load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not notify driver",
      );
    }
  }

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
  // Payment lifecycle: webhook → SSE → refetch the booking so the badge,
  // capture amount, and refund total reflect Stripe's authoritative state.
  useRealtimeEvent("payment_status_changed", (e) => {
    if (e.bookingId === bookingId) load();
  });
  // Driver vehicle / rating / name changed — refetch only if the assigned
  // primary driver is the affected one.
  useRealtimeEvent("driver_profile_updated", (e) => {
    if (detail?.assignments.some((a) => a.driverId === e.driverId)) load();
  });
  useRealtimeEvent("user_updated", (e) => {
    if (detail?.assignments.some((a) => a.driverId === e.userId)) load();
  });
  // Self-heal after an SSE drop / visibility resume / server overflow.
  useRealtimeRecovery(load);

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
    // Show the policy decision (fee + refund) BEFORE the customer
    // confirms. If we can't fetch a preview (Stripe disabled, network),
    // fall back to a generic confirm.
    let confirmMessage = "This cannot be undone. Continue?";
    try {
      const { decision } = await getCancelPreview(booking.id);
      if (decision.feePence === 0) {
        confirmMessage = `${decision.reason} You won't be charged.`;
      } else if (decision.refundablePence === 0) {
        confirmMessage = `${decision.reason} You will be charged ${formatPrice(decision.feePence)}.`;
      } else {
        confirmMessage = `${decision.reason} A ${formatPrice(decision.feePence)} fee will be charged; ${formatPrice(decision.refundablePence)} will be released back to your card.`;
      }
    } catch {
      // Preview fetch failed — fall through with generic message.
    }
    const ok = await confirm({
      title: "Cancel booking",
      message: confirmMessage,
      confirmLabel: "Cancel ride",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const result = await cancelBooking(booking.id);
      const fee = result.cancellation?.feePence ?? 0;
      toast.success(
        fee > 0
          ? `Booking cancelled — ${formatPrice(fee)} cancellation fee charged`
          : "Booking cancelled",
      );
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

  const canCancel =
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
                  <ArrivedPanel
                    booking={booking}
                    nowTick={nowTick}
                    onCustomerArrived={handleCustomerArrived}
                  />
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

            {/* Payment summary — paymentStatus is the source of truth here.
                Lives below the headline price so the customer always sees
                refunded/captured state alongside what they were charged. */}
            {booking.paymentStatus &&
              booking.paymentStatus !== "unpaid" &&
              booking.paymentStatus !== "pending" && (
                <section>
                  <div className="flex items-center justify-between">
                    <p className="section-label">Payment</p>
                    <PaymentStatusBadge status={booking.paymentStatus} />
                  </div>
                  <div className="glass-card p-3 space-y-2 mt-2">
                    {booking.amountCapturedPence > 0 && (
                      <div className="flex justify-between caption-copy">
                        <span>Charged</span>
                        <strong className="tabular-nums">
                          {formatPrice(booking.amountCapturedPence)}
                        </strong>
                      </div>
                    )}
                    {booking.amountRefundedPence > 0 && (
                      <div className="flex justify-between caption-copy">
                        <span>Refunded to your card</span>
                        <strong className="tabular-nums text-[var(--color-forest)]">
                          −{formatPrice(booking.amountRefundedPence)}
                        </strong>
                      </div>
                    )}
                    {booking.cancellationFeePence > 0 && (
                      <div className="flex justify-between caption-copy">
                        <span>Cancellation fee</span>
                        <strong className="tabular-nums">
                          {formatPrice(booking.cancellationFeePence)}
                        </strong>
                      </div>
                    )}
                    {booking.amountRefundedPence > 0 &&
                      booking.amountCapturedPence > 0 && (
                        <p className="caption-copy text-[var(--color-mid)]">
                          Refunds typically take 5–10 business days to appear on
                          your statement.
                        </p>
                      )}
                  </div>
                </section>
              )}

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
              {canCancel && (
                <button onClick={handleCancel} className="btn-ghost w-full">
                  <span className="inline-flex items-center gap-2 text-[var(--color-error)]">
                    <IconX className="h-4 w-4" />
                    Cancel
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Help modal — Contact Admin dials admin; SOS dials emergency services. */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
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
              {publicSettings?.adminContactPhone ? (
                <a
                  href={`tel:${publicSettings.adminContactPhone}`}
                  onClick={() => setHelpOpen(false)}
                  className="btn-secondary w-full text-sm py-3 text-center block"
                >
                  <span className="inline-flex items-center gap-2">
                    <IconPhone className="h-4 w-4" />
                    Call admin
                  </span>
                </a>
              ) : (
                <button
                  disabled
                  className="btn-secondary w-full text-sm py-3 opacity-50 cursor-not-allowed"
                >
                  <span className="inline-flex items-center gap-2">
                    <IconPhone className="h-4 w-4" />
                    Admin phone unavailable
                  </span>
                </button>
              )}
              <button
                onClick={async () => {
                  const number = publicSettings?.emergencyNumber || "999";
                  const ok = await confirm({
                    title: "Call emergency services?",
                    message: `This will dial ${number} on your device. We will also alert our admin team.`,
                    confirmLabel: `Call ${number}`,
                    variant: "danger",
                  });
                  if (!ok) return;
                  setHelpOpen(false);
                  // Notify admin in parallel so ops sees the SOS even if the
                  // call drops or the customer can't speak.
                  reportIncident(booking.id, "emergency", "SOS dialled").catch(
                    () => {},
                  );
                  window.location.href = `tel:${number}`;
                }}
                className="btn-danger w-full text-sm py-3"
              >
                SOS — Call emergency services
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
