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
import { IconCar } from "../../components/icons";

interface Assignment {
  id: number;
  driverId: number;
  role: string;
  isActive: boolean;
  driverName: string;
  driverPhone: string | null;
}

interface Props {
  bookingId: number | null;
  onClose: () => void;
  onUpdated: () => void;
  variant?: "modal" | "panel";
}

export default function RideDetail({
  bookingId,
  onClose,
  onUpdated,
  variant = "modal",
}: Props) {
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
    if (!bookingId) {
      setBooking(null);
      setAssignments([]);
      return;
    }
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
    (["assigned", "en_route", "arrived", "in_progress"] as string[]).includes(
      booking.status,
    ) &&
    assignments.some((a) => a.role === "primary" && a.isActive) &&
    assignments.some((a) => a.role === "backup" && a.isActive);

  const content =
    loading || !booking ? (
      <div className="space-y-4 py-2">
        <SkeletonText lines={4} />
      </div>
    ) : (
      <div className="admin-detail-content">
        <div className="admin-detail-hero">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mono-label">Selected ride</p>
              <h2>{formatDate(booking.scheduledAt)}</h2>
            </div>
            <StatusBadge status={booking.status} />
          </div>
          <div className="admin-detail-route">
            <div>
              <span>P</span>
              <p>{booking.pickupAddress}</p>
            </div>
            <div>
              <span>D</span>
              <p>{booking.dropoffAddress}</p>
            </div>
          </div>
          <div className="admin-detail-meta-row">
            <span>{formatPrice(booking.pricePence)}</span>
            <span>{booking.vehicleClass}</span>
            {booking.isAirport && (
              <span className="ds-tag tag-airport">AIRPORT</span>
            )}
          </div>
        </div>

        <div className="admin-detail-section">
          <h3 className="section-label">Customer</h3>
          <div className="admin-data-grid">
            <div>
              <span>Name</span>
              <strong>{booking.customerName || "Not provided"}</strong>
            </div>
            <div>
              <span>Phone</span>
              <strong>{booking.customerPhone || "Not provided"}</strong>
            </div>
          </div>
        </div>

        {assignments.length > 0 && (
          <div className="admin-detail-section">
            <h3 className="section-label">Drivers</h3>
            <div className="admin-assignment-list">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className={`admin-assignment-row ${
                    assignment.isActive ? "is-active" : ""
                  }`}
                >
                  <div>
                    <strong>{assignment.driverName}</strong>
                    <span>{assignment.role}</span>
                  </div>
                  <span>{assignment.driverPhone || "No phone"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="admin-detail-section">
          <h3 className="section-label">Actions</h3>
          <div className="admin-action-row">
            {booking.status === "scheduled" && (
              <button
                onClick={() => handleStatusChange("cancelled")}
                className="btn-danger button-text-compact"
              >
                Cancel
              </button>
            )}
            {booking.status === "assigned" && (
              <button
                onClick={() => handleStatusChange("en_route")}
                className="btn-secondary button-text-compact"
              >
                Set en route
              </button>
            )}
            {booking.status === "en_route" && (
              <button
                onClick={() => handleStatusChange("arrived")}
                className="btn-secondary button-text-compact"
              >
                Set arrived
              </button>
            )}
            {booking.status === "arrived" && (
              <button
                onClick={() => handleStatusChange("in_progress")}
                className="btn-primary button-text-compact"
              >
                Start ride
              </button>
            )}
            {booking.status === "in_progress" && (
              <button
                onClick={() => handleStatusChange("completed")}
                className="btn-green button-text-compact"
              >
                Complete
              </button>
            )}
            {canFallback && (
              <button
                onClick={handleFallback}
                className="btn-danger button-text-compact"
              >
                Trigger fallback
              </button>
            )}
          </div>
        </div>

        {(booking.status === "scheduled" || booking.status === "assigned") && (
          <DriverAssignmentForm
            bookingId={booking.id}
            onAssigned={() => {
              fetchDetail();
              onUpdated();
            }}
          />
        )}
      </div>
    );

  if (variant === "panel") {
    if (!bookingId) {
      return (
        <div className="admin-detail-placeholder">
          <div className="empty-state-icon">
            <IconCar className="h-8 w-8" />
          </div>
          <p className="body-copy font-medium">Select a ride</p>
          <p className="caption-copy">
            Pick a row from the queue to assign drivers or inspect status.
          </p>
        </div>
      );
    }
    return (
      <>
        <div className="admin-detail-panel-inner">{content}</div>
        {dialogProps && <ConfirmDialog {...dialogProps} />}
      </>
    );
  }

  return (
    <>
      <Modal isOpen={!!bookingId} onClose={onClose} title="Ride Detail">
        {content}
      </Modal>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </>
  );
}
