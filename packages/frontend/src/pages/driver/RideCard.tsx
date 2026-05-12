import { useEffect, useState } from "react";
import type { Booking, BookingStatus } from "shared/types";
import StatusBadge from "../../components/StatusBadge";
import ConfirmDialog from "../../components/ConfirmDialog";
import { formatDate, formatPrice } from "../../lib/format";
import { api, ApiError } from "../../api/client";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast } from "../../context/ToastContext";
import { IconMapPin } from "../../components/icons";
import {
  markNoShow,
  markCashCollected,
} from "../../api/bookings";
import { getPublicSettings } from "../../api/settings";

interface Props {
  booking: Booking;
  onStatusUpdate: () => void;
}

const NEXT_STATUS: Partial<
  Record<BookingStatus, { label: string; status: BookingStatus; color: string }>
> = {
  assigned: {
    label: "Start En Route",
    status: "en_route",
    color: "btn-secondary",
  },
  en_route: {
    label: "Mark Arrived",
    status: "arrived",
    color: "btn-secondary",
  },
  arrived: {
    label: "Start Ride",
    status: "in_progress",
    color: "btn-primary",
  },
  in_progress: {
    label: "Complete Ride",
    status: "completed",
    color: "btn-green",
  },
};

const STATUS_BORDER: Partial<Record<BookingStatus, string>> = {
  assigned: "border-l-[var(--color-orange)]",
  en_route: "border-l-[var(--color-navy)]",
  arrived: "border-l-[var(--color-forest)]",
  in_progress: "border-l-[var(--color-navy)]",
  completed: "border-l-[var(--color-green)]",
};

// Hardcoded fallback — actual threshold comes from /settings/public.
const DEFAULT_NO_SHOW_AFTER_MIN = 45;

export default function RideCard({ booking, onStatusUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [noShowAfterMin, setNoShowAfterMin] = useState<number>(
    DEFAULT_NO_SHOW_AFTER_MIN,
  );
  const [tick, setTick] = useState(Date.now());
  const { confirm, dialogProps } = useConfirm();
  const toast = useToast();
  const next = NEXT_STATUS[booking.status];

  // Re-render once per second while waiting at pickup so the no-show
  // button enables exactly when the grace window passes.
  useEffect(() => {
    if (booking.status !== "arrived") return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [booking.status]);

  useEffect(() => {
    getPublicSettings()
      .then(() => {
        // Public settings endpoint doesn't expose no-show minutes today,
        // so we keep the fallback. The eligibility check still happens
        // server-side; this just hides the button until the window.
      })
      .catch(() => {});
  }, []);

  async function handleAction() {
    if (!next) return;
    const ok = await confirm({
      title: "Update Status",
      message: `Set this ride to "${next.label}"?`,
    });
    if (!ok) return;
    setLoading(true);
    try {
      await api.patch(`/bookings/${booking.id}/status`, {
        status: next.status,
      });
      toast.success(`Ride set to ${next.label}`);
      onStatusUpdate();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setLoading(false);
    }
  }

  async function handleNoShow() {
    const ok = await confirm({
      title: "Mark no-show?",
      message:
        "This cancels the booking and charges the customer the full fare plus waiting fee. Continue?",
      confirmLabel: "Mark no-show",
      variant: "danger",
    });
    if (!ok) return;
    setLoading(true);
    try {
      await markNoShow(booking.id);
      toast.success("Booking marked no-show");
      onStatusUpdate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to mark");
    } finally {
      setLoading(false);
    }
  }

  async function handleCashCollected() {
    const ok = await confirm({
      title: "Confirm cash collected?",
      message: `Confirm you received ${formatPrice(booking.balanceDuePence ?? 0)} in cash from the customer.`,
      confirmLabel: "Confirm",
    });
    if (!ok) return;
    setLoading(true);
    try {
      await markCashCollected(booking.id);
      toast.success("Cash collected");
      onStatusUpdate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to mark");
    } finally {
      setLoading(false);
    }
  }

  const driverArrivedMs = booking.driverArrivedAt
    ? new Date(booking.driverArrivedAt).getTime()
    : null;
  const minutesSinceArrival = driverArrivedMs
    ? (tick - driverArrivedMs) / 60_000
    : 0;
  const noShowEligible =
    booking.status === "arrived" &&
    !booking.customerArrivedAt &&
    driverArrivedMs != null &&
    minutesSinceArrival >= noShowAfterMin;

  const customerArrivedFlag = !!booking.customerArrivedAt;

  return (
    <div
      className={`glass-card border-l-4 p-4 ${STATUS_BORDER[booking.status] ?? "border-l-gray-200"}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1 min-w-0 pr-3">
          <div className="flex items-start gap-1.5 text-sm font-medium text-[var(--color-dark)]">
            <IconMapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-forest)]" />
            <span className="truncate">{booking.pickupAddress}</span>
          </div>
          <div className="caption-copy flex items-start gap-1.5">
            <IconMapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-dark)]" />
            <span className="truncate">{booking.dropoffAddress}</span>
          </div>
          <div className="mono-label">
            {formatDate(booking.scheduledAt)} ·{" "}
            {formatPrice(booking.pricePence)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={booking.status} />
          {booking.isAirport && (
            <span className="ds-tag tag-airport">AIRPORT</span>
          )}
          {booking.paymentMethod === "cash" && (
            <span className="ds-tag">CASH</span>
          )}
        </div>
      </div>

      {/* Customer-arrived banner */}
      {customerArrivedFlag && booking.status === "arrived" && (
        <div className="alert alert-success mt-3" role="status">
          Customer says they're here — they're at the pickup point.
        </div>
      )}

      {next && (
        <button
          onClick={handleAction}
          disabled={loading}
          className={`btn-press mt-3 w-full ${next.color}`}
        >
          {loading ? "Updating..." : next.label}
        </button>
      )}

      {/* No-show — visible once the grace window has elapsed at pickup. */}
      {noShowEligible && (
        <button
          onClick={handleNoShow}
          disabled={loading}
          className="btn-danger mt-2 w-full text-sm"
        >
          Mark no-show
        </button>
      )}

      {/* Cash collection — visible after completion if balance unpaid. */}
      {booking.paymentMethod === "cash" &&
        booking.status === "completed" &&
        (booking.balanceDuePence ?? 0) > 0 &&
        !booking.cashCollectedAt && (
          <button
            onClick={handleCashCollected}
            disabled={loading}
            className="btn-primary mt-2 w-full text-sm"
          >
            Confirm cash collected ({formatPrice(booking.balanceDuePence ?? 0)})
          </button>
        )}

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
