import { useState, type FormEvent } from "react";
import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

interface Props {
  /** Where to redirect to after a 3DS / off-page step. Stripe will only
   * navigate here if the payment method actually requires a redirect. */
  returnUrl: string;
  amountLabel: string;
  /** Called once confirmPayment resolves with status `succeeded` or
   * `requires_capture` (manual-capture authorisation). The webhook is
   * the source of truth — this just lets the UI move forward. */
  onAuthorized: () => void;
  onCancel?: () => void;
}

/**
 * Payment Element shell. Owns the submit button + spinner + inline
 * error display. The actual card-entry UI is rendered by Stripe inside
 * <PaymentElement />.
 *
 * Manual-capture flow: confirmPayment with redirect=if_required will
 * resolve with `paymentIntent.status === "requires_capture"` once the
 * card is authorised. We treat that as success — the backend webhook
 * has already flipped the booking to `authorized` by the time the
 * customer lands on the booking detail page.
 */
export default function PaymentForm({
  returnUrl,
  amountLabel,
  onAuthorized,
  onCancel,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment(
      {
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      },
    );

    if (confirmError) {
      // card_error / validation_error are safe to show; everything else
      // gets a generic message so we don't leak Stripe internals.
      const userMessage =
        confirmError.type === "card_error" ||
        confirmError.type === "validation_error"
          ? confirmError.message || "Your card was declined."
          : "We couldn't process your payment. Please try again.";
      setError(userMessage);
      setSubmitting(false);
      return;
    }

    if (
      paymentIntent &&
      (paymentIntent.status === "requires_capture" ||
        paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing")
    ) {
      onAuthorized();
      return;
    }

    setError(
      "Payment did not complete. If your card was charged this will reverse automatically.",
    );
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
          // Phase 8 will collect billing details for receipts; for now
          // Stripe pulls what it can from the saved customer.
          fields: { billingDetails: "auto" },
        }}
      />

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn-secondary flex-1"
          >
            <span>Back</span>
          </button>
        )}
        <button
          type="submit"
          disabled={!stripe || !elements || submitting}
          className="btn-green flex-1"
        >
          <span>{submitting ? "Authorising…" : `Pay ${amountLabel}`}</span>
          <span className="btn-icon" aria-hidden="true">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
      </div>

      <p className="text-[11px] leading-snug text-[var(--color-muted,#737373)]">
        Your card will be authorised now and charged when the ride is
        completed. Cancellations more than 24 hours before pickup are
        refunded in full.
      </p>
    </form>
  );
}
