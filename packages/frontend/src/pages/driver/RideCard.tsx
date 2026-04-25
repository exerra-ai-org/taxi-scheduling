import { useState } from "react";
import type { Booking, BookingStatus } from "shared/types";
import StatusBadge from "../../components/StatusBadge";
import ConfirmDialog from "../../components/ConfirmDialog";
import { formatDate, formatPrice } from "../../lib/format";
import { api } from "../../api/client";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast } from "../../context/ToastContext";
import { IconMapPin } from "../../components/icons";

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
    label: "Complete Ride",
    status: "completed",
    color: "btn-green",
  },
};

const STATUS_BORDER: Partial<Record<BookingStatus, string>> = {
  assigned: "border-l-[var(--color-orange)]",
  en_route: "border-l-[var(--color-navy)]",
  arrived: "border-l-[var(--color-forest)]",
  completed: "border-l-[var(--color-green)]",
};

export default function RideCard({ booking, onStatusUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const { confirm, dialogProps } = useConfirm();
  const toast = useToast();
  const next = NEXT_STATUS[booking.status];

  async function handleAction() {
    if (!next) return;
    const ok = await confirm({
      title: "Update Status",
      message: `Set this ride to "${next.label}"?`,
    });
    if (!ok) return;
    setLoading(true);
    try {
      await api.patch(`/api/bookings/${booking.id}/status`, {
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
        </div>
      </div>
      {next && (
        <button
          onClick={handleAction}
          disabled={loading}
          className={`btn-press mt-3 w-full ${next.color}`}
        >
          {loading ? "Updating..." : next.label}
        </button>
      )}
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
