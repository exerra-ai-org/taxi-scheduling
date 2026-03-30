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
    color: "bg-orange-500 hover:bg-orange-600",
  },
  en_route: {
    label: "Mark Arrived",
    status: "arrived",
    color: "bg-purple-600 hover:bg-purple-700",
  },
  arrived: {
    label: "Complete Ride",
    status: "completed",
    color: "bg-green-600 hover:bg-green-700",
  },
};

const STATUS_BORDER: Partial<Record<BookingStatus, string>> = {
  assigned: "border-l-indigo-400",
  en_route: "border-l-orange-400",
  arrived: "border-l-purple-400",
  completed: "border-l-green-500",
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
      className={`bg-white border border-l-4 rounded-lg p-4 ${STATUS_BORDER[booking.status] ?? "border-l-gray-200"}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1 min-w-0 pr-3">
          <div className="flex items-start gap-1.5 text-sm font-medium">
            <IconMapPin className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
            <span className="truncate">{booking.pickupAddress}</span>
          </div>
          <div className="flex items-start gap-1.5 text-sm text-gray-500">
            <IconMapPin className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <span className="truncate">{booking.dropoffAddress}</span>
          </div>
          <div className="text-xs text-gray-400">
            {formatDate(booking.scheduledAt)} ·{" "}
            {formatPrice(booking.pricePence)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={booking.status} />
          {booking.isAirport && (
            <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
              AIRPORT
            </span>
          )}
        </div>
      </div>
      {next && (
        <button
          onClick={handleAction}
          disabled={loading}
          className={`mt-3 w-full text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${next.color}`}
        >
          {loading ? "Updating..." : next.label}
        </button>
      )}
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
