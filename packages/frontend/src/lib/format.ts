import type { BookingStatus } from "shared/types";

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

export function formatCompactAddress(address: string, maxLength = 34): string {
  const compact = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");

  const source = compact || address.trim();
  if (source.length <= maxLength) return source;
  return `${source.slice(0, maxLength - 1).trimEnd()}…`;
}

export function statusLabel(status: BookingStatus): string {
  const labels: Record<BookingStatus, string> = {
    scheduled: "Scheduled",
    assigned: "Assigned",
    en_route: "En Route",
    arrived: "Arrived",
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
    completed: "status-completed",
    cancelled: "status-cancelled",
  };
  return colors[status] || "status-inactive";
}
