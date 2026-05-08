import { useMemo, useState } from "react";
import type { Booking } from "shared/types";
import type {
  PaymentTrail,
  AdminRefundReason,
  RefundRow,
} from "../../api/bookings";
import { refundBooking } from "../../api/admin";
import { useToast } from "../../context/ToastContext";
import Modal from "../../components/Modal";
import PaymentStatusBadge from "../../components/PaymentStatusBadge";
import { formatPrice, formatDate } from "../../lib/format";

interface Props {
  booking: Booking;
  paymentTrail: PaymentTrail | null | undefined;
  onRefunded: () => void;
}

const REFUND_REASONS: { value: AdminRefundReason; label: string }[] = [
  { value: "requested_by_customer", label: "Requested by customer" },
  { value: "service_failure", label: "Service failure" },
  { value: "route_change", label: "Route change" },
  { value: "duplicate", label: "Duplicate charge" },
  { value: "fraudulent", label: "Fraudulent" },
  { value: "other", label: "Other" },
];

// PI ids look like `pi_3R...` — Stripe Dashboard accepts this exact path.
function stripeDashboardUrl(intentId: string) {
  return `https://dashboard.stripe.com/payments/${intentId}`;
}

function refundReasonLabel(value: string): string {
  const known = REFUND_REASONS.find((r) => r.value === value);
  if (known) return known.label;
  if (value === "cancellation_full") return "Full cancellation";
  if (value === "cancellation_partial") return "Partial cancellation";
  return value;
}

export default function AdminPaymentPanel({
  booking,
  paymentTrail,
  onRefunded,
}: Props) {
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState<AdminRefundReason>(
    "requested_by_customer",
  );
  const [adminNote, setAdminNote] = useState("");
  // Empty input → full refund. Tracked as a string so we can validate
  // the typed value before coercing to pence; "Full" / "Partial" toggle
  // doesn't need a separate variable.
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const refundable = booking.amountCapturedPence - booking.amountRefundedPence;
  const canRefund =
    refundable > 0 &&
    (booking.paymentStatus === "captured" ||
      booking.paymentStatus === "partially_refunded");

  const refunds = paymentTrail?.refunds ?? [];

  const summaryRows = useMemo(
    () =>
      [
        booking.amountAuthorizedPence > 0 && {
          label: "Authorised",
          value: formatPrice(booking.amountAuthorizedPence),
        },
        booking.amountCapturedPence > 0 && {
          label: "Captured",
          value: formatPrice(booking.amountCapturedPence),
        },
        booking.amountRefundedPence > 0 && {
          label: "Refunded",
          value: `−${formatPrice(booking.amountRefundedPence)}`,
        },
        booking.cancellationFeePence > 0 && {
          label: "Cancellation fee",
          value: formatPrice(booking.cancellationFeePence),
        },
      ].filter(Boolean) as { label: string; value: string }[],
    [booking],
  );

  async function handleSubmitRefund() {
    let amountPence: number | null = null;
    if (amountInput.trim()) {
      const parsed = parseFloat(amountInput);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast.error("Enter a valid refund amount");
        return;
      }
      amountPence = Math.round(parsed * 100);
      if (amountPence > refundable) {
        toast.error(
          `Refund cannot exceed the refundable balance (${formatPrice(refundable)})`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await refundBooking(booking.id, {
        amountPence,
        reason,
        adminNote: adminNote.trim() || null,
      });
      toast.success(
        `Refund of ${formatPrice(result.refund.amountPence)} initiated`,
      );
      setRefundOpen(false);
      setAmountInput("");
      setAdminNote("");
      onRefunded();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Refund failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-detail-section">
      <div className="flex items-start justify-between gap-3">
        <h3 className="section-label">Payment</h3>
        <PaymentStatusBadge status={booking.paymentStatus} />
      </div>

      {summaryRows.length > 0 && (
        <div className="admin-data-grid mt-2">
          {summaryRows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      )}

      {booking.activePaymentIntentId && (
        <p className="caption-copy mt-2">
          Stripe intent:{" "}
          <a
            href={stripeDashboardUrl(booking.activePaymentIntentId)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-underline"
          >
            {booking.activePaymentIntentId}
          </a>
        </p>
      )}

      {refunds.length > 0 && (
        <div className="mt-3">
          <p className="mono-label mb-1">Refund history</p>
          <ul className="admin-refund-list">
            {refunds.map((r: RefundRow) => (
              <li key={r.id} className="admin-refund-row">
                <div>
                  <strong>{formatPrice(r.amountPence)}</strong>
                  <span className="ml-2 caption-copy">
                    {refundReasonLabel(r.reason)}
                  </span>
                </div>
                <div className="caption-copy">
                  <span>{r.status}</span>
                  <span className="ml-2">{formatDate(r.createdAt)}</span>
                </div>
                {r.adminNote && (
                  <p className="caption-copy w-full mt-1">{r.adminNote}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="admin-action-row mt-3">
        <button
          onClick={() => setRefundOpen(true)}
          disabled={!canRefund}
          className="btn-secondary button-text-compact"
          title={
            canRefund
              ? `Refund up to ${formatPrice(refundable)}`
              : "Booking is not in a refundable state"
          }
        >
          Issue refund
        </button>
      </div>

      <Modal
        isOpen={refundOpen}
        onClose={() => (submitting ? null : setRefundOpen(false))}
        title="Issue refund"
      >
        <div className="space-y-4">
          <div>
            <p className="caption-copy">
              Refundable balance: <strong>{formatPrice(refundable)}</strong>
            </p>
            <p className="caption-copy">
              Refunds go back to the customer's original card and typically take
              5–10 business days to appear.
            </p>
          </div>

          <label className="block">
            <span className="mono-label">Amount (£)</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={(refundable / 100).toFixed(2)}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder={`Leave empty for full refund (${formatPrice(refundable)})`}
              className="input-glass mt-1 w-full"
              disabled={submitting}
            />
          </label>

          <label className="block">
            <span className="mono-label">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as AdminRefundReason)}
              className="input-glass mt-1 w-full"
              disabled={submitting}
            >
              {REFUND_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mono-label">Admin note (optional)</span>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Internal-only context for this refund"
              className="input-glass mt-1 w-full"
              disabled={submitting}
            />
          </label>

          <div className="admin-action-row">
            <button
              onClick={() => setRefundOpen(false)}
              disabled={submitting}
              className="btn-secondary button-text-compact"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitRefund}
              disabled={submitting}
              className="btn-danger button-text-compact"
            >
              {submitting ? "Refunding…" : "Confirm refund"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
