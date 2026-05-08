import type { PaymentStatus } from "shared/types";
import { paymentStatusLabel, paymentStatusColor } from "../lib/format";

export default function PaymentStatusBadge({
  status,
  compact = false,
}: {
  status: PaymentStatus | null | undefined;
  compact?: boolean;
}) {
  if (!status) return null;
  return (
    <span
      className={`status-pill ${paymentStatusColor(status)} ${compact ? "status-pill-compact" : ""}`}
    >
      {paymentStatusLabel(status)}
    </span>
  );
}
