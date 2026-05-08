import type { BookingStatus, PaymentStatus } from "shared/types";

export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(status: BookingStatus): string {
  const labels: Record<BookingStatus, string> = {
    scheduled: "Scheduled",
    assigned: "Assigned",
    en_route: "En Route",
    arrived: "Arrived",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return labels[status] || status;
}

export function statusColor(status: BookingStatus): string {
  const colors: Record<BookingStatus, string> = {
    scheduled: "status-scheduled",
    assigned: "status-assigned",
    en_route: "status-en-route",
    arrived: "status-arrived",
    in_progress: "status-en-route",
    completed: "status-completed",
    cancelled: "status-cancelled",
  };
  return colors[status] || "status-inactive";
}

// Plain-English labels for paymentStatus on the booking projection.
// Tuned for at-a-glance scanning in admin lists, not strict Stripe vocab.
export function paymentStatusLabel(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    unpaid: "Unpaid",
    pending: "Awaiting card",
    requires_action: "3DS pending",
    authorized: "Authorised",
    captured: "Paid",
    partially_refunded: "Partial refund",
    refunded: "Refunded",
    failed: "Failed",
    disputed: "Disputed",
    uncollectible: "Uncollectible",
  };
  return labels[status] ?? status;
}

// Re-uses the existing booking status pill palette so the badges feel
// part of the same design system. We map by intent (success/warn/danger)
// rather than introducing new tokens.
export function paymentStatusColor(status: PaymentStatus): string {
  const colors: Record<PaymentStatus, string> = {
    unpaid: "status-inactive",
    pending: "status-scheduled",
    requires_action: "status-scheduled",
    authorized: "status-arrived",
    captured: "status-completed",
    partially_refunded: "status-assigned",
    refunded: "status-inactive",
    failed: "status-cancelled",
    disputed: "status-cancelled",
    uncollectible: "status-cancelled",
  };
  return colors[status] ?? "status-inactive";
}
