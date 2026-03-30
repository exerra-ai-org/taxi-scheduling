import { useState } from "react";
import type { Booking, BookingStatus } from "shared/types";
import StatusBadge from "../../components/StatusBadge";
import ConfirmDialog from "../../components/ConfirmDialog";
import { formatDate, formatPrice } from "../../lib/format";
import { api } from "../../api/client";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast } from "../../context/ToastContext";

interface Props {
  booking: Booking;
  onStatusUpdate: () => void;
}

const NEXT_STATUS: Partial<
  Record<BookingStatus, { label: string; status: BookingStatus }>
> = {
  assigned: { label: "Start En Route", status: "en_route" },
  en_route: { label: "Mark Arrived", status: "arrived" },
  arrived: { label: "Complete Ride", status: "completed" },
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
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium">
            {booking.pickupAddress} → {booking.dropoffAddress}
          </div>
          <div className="text-xs text-gray-500">
            {formatDate(booking.scheduledAt)} ·{" "}
            {formatPrice(booking.pricePence)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
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
          className="mt-3 w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Updating..." : next.label}
        </button>
      )}
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
