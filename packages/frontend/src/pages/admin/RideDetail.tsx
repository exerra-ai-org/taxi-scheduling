import { useEffect, useState } from "react";
import type { Booking, BookingStatus } from "shared/types";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import DriverAssignmentForm from "./DriverAssignmentForm";
import {
  getBookingDetail,
  updateBookingStatus,
  triggerFallback,
} from "../../api/admin";
import { SkeletonText } from "../../components/Skeleton";
import ConfirmDialog from "../../components/ConfirmDialog";
import { formatPrice, formatDate } from "../../lib/format";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast } from "../../context/ToastContext";

interface Assignment {
  id: number;
  driverId: number;
  role: string;
  isActive: boolean;
  driverName: string;
  driverPhone: string;
}

interface Props {
  bookingId: number | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function RideDetail({ bookingId, onClose, onUpdated }: Props) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const { confirm: confirmAction, dialogProps } = useConfirm();
  const toast = useToast();

  async function fetchDetail() {
    if (!bookingId) return;
    setLoading(true);
    try {
      const data = await getBookingDetail(bookingId);
      setBooking(data.booking);
      setAssignments(data.assignments);
    } catch {
      // handle error silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDetail();
  }, [bookingId]);

  async function handleStatusChange(status: BookingStatus) {
    if (!bookingId) return;
    try {
      await updateBookingStatus(bookingId, status);
      toast.success("Status updated");
      fetchDetail();
      onUpdated();
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function handleFallback() {
    if (!bookingId) return;
    const ok = await confirmAction({
      title: "Trigger Fallback",
      message:
        "This will deactivate the primary driver and the backup driver will take over. Continue?",
      confirmLabel: "Trigger Fallback",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await triggerFallback(bookingId);
      toast.success("Fallback triggered");
      fetchDetail();
      onUpdated();
    } catch {
      toast.error("Failed to trigger fallback");
    }
  }

  const canFallback =
    booking &&
    (booking.status === "assigned" || booking.status === "en_route") &&
    assignments.some((a) => a.role === "primary" && a.isActive) &&
    assignments.some((a) => a.role === "backup" && a.isActive);

  return (
    <>
      <Modal isOpen={!!bookingId} onClose={onClose} title="Ride Detail">
        {loading || !booking ? (
          <div className="space-y-4 py-2">
            <SkeletonText lines={4} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Booking info */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <StatusBadge status={booking.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pickup</span>
                <span className="font-medium">{booking.pickupAddress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Drop-off</span>
                <span className="font-medium">{booking.dropoffAddress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Scheduled</span>
                <span className="font-medium">
                  {formatDate(booking.scheduledAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Price</span>
                <span className="font-medium">
                  {formatPrice(booking.pricePence)}
                </span>
              </div>
              {booking.isAirport && (
                <div className="text-center">
                  <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                    AIRPORT
                  </span>
                </div>
              )}
            </div>

            {/* Assignments */}
            {assignments.length > 0 && (
              <div>
                <h3 className="font-medium text-sm mb-2">Assigned Drivers</h3>
                <div className="space-y-1">
                  {assignments.map((a) => (
                    <div
                      key={a.id}
                      className={`flex justify-between text-sm px-2 py-1 rounded ${
                        a.isActive ? "bg-green-50" : "bg-gray-50 text-gray-400"
                      }`}
                    >
                      <span>
                        {a.driverName}{" "}
                        <span className="text-xs">({a.role})</span>
                      </span>
                      <span className="text-xs">{a.driverPhone}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status actions */}
            <div>
              <h3 className="font-medium text-sm mb-2">Actions</h3>
              <div className="flex flex-wrap gap-2">
                {booking.status === "scheduled" && (
                  <button
                    onClick={() => handleStatusChange("cancelled")}
                    className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded hover:bg-red-200"
                  >
                    Cancel
                  </button>
                )}
                {booking.status === "assigned" && (
                  <button
                    onClick={() => handleStatusChange("en_route")}
                    className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded hover:bg-orange-200"
                  >
                    Set En Route
                  </button>
                )}
                {booking.status === "en_route" && (
                  <button
                    onClick={() => handleStatusChange("arrived")}
                    className="text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded hover:bg-purple-200"
                  >
                    Set Arrived
                  </button>
                )}
                {booking.status === "arrived" && (
                  <button
                    onClick={() => handleStatusChange("completed")}
                    className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded hover:bg-green-200"
                  >
                    Complete
                  </button>
                )}
                {canFallback && (
                  <button
                    onClick={handleFallback}
                    className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700"
                  >
                    Trigger Fallback
                  </button>
                )}
              </div>
            </div>

            {/* Driver assignment form */}
            {(booking.status === "scheduled" ||
              booking.status === "assigned") && (
              <DriverAssignmentForm
                bookingId={booking.id}
                onAssigned={() => {
                  fetchDetail();
                  onUpdated();
                }}
              />
            )}
          </div>
        )}
      </Modal>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </>
  );
}
