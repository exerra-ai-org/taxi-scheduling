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
    scheduled: "bg-blue-100 text-blue-800",
    assigned: "bg-yellow-100 text-yellow-800",
    en_route: "bg-orange-100 text-orange-800",
    arrived: "bg-purple-100 text-purple-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}
