import type { BookingStatus } from "shared/types";
import { statusLabel, statusColor } from "../lib/format";

const PULSE_STATUSES: BookingStatus[] = ["en_route", "arrived"];

export default function StatusBadge({ status }: { status: BookingStatus }) {
  const pulse = PULSE_STATUSES.includes(status);
  return (
    <span className="relative inline-flex items-center">
      {pulse && (
        <span
          className={`absolute -inset-0.5 rounded-full opacity-60 animate-pulse-ring ${statusColor(status)}`}
        />
      )}
      <span
        className={`relative px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(status)}`}
      >
        {statusLabel(status)}
      </span>
    </span>
  );
}
