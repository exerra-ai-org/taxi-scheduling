import type { BookingStatus } from "shared/types";
import { statusLabel, statusColor } from "../lib/format";

const PULSE_STATUSES: BookingStatus[] = ["en_route", "arrived"];

export default function StatusBadge({ status }: { status: BookingStatus }) {
  const pulse = PULSE_STATUSES.includes(status);
  return (
    <span className="relative inline-flex items-center">
      {pulse && (
        <span
          className={`absolute -inset-1 rounded-[6px] opacity-60 animate-pulse-ring ${statusColor(status)}`}
        />
      )}
      <span className={`relative status-pill ${statusColor(status)}`}>
        {statusLabel(status)}
      </span>
    </span>
  );
}
