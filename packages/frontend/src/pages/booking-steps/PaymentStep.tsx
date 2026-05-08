import { useNavigate } from "react-router-dom";
import type { BookingPaymentInit } from "../../api/bookings";
import { clearBookingDraft } from "../BookingFlow";
import { useToast } from "../../context/ToastContext";
import StripeProvider from "../../components/payments/StripeProvider";
import PaymentForm from "../../components/payments/PaymentForm";
import { formatPrice } from "../../lib/format";

interface Props {
  bookingId: number;
  payment: BookingPaymentInit;
  onBack: () => void;
}

/**
 * Final booking step. The booking row exists with paymentStatus=pending
 * and a 15-minute hold; this step embeds the Payment Element and
 * resolves the hold by getting the customer's authorisation. The
 * backend webhook flips the booking to `authorized` — this component
 * just hands off to the booking detail page once Stripe confirms.
 */
export default function PaymentStep({ bookingId, payment, onBack }: Props) {
  const navigate = useNavigate();
  const toast = useToast();

  const returnUrl = `${window.location.origin}/bookings/${bookingId}?payment=return`;

  function handleAuthorized() {
    clearBookingDraft();
    toast.success("Payment authorised");
    // Webhook updates flow in via SSE; the booking detail page reflects
    // the live paymentStatus.
    navigate(`/bookings/${bookingId}`, { replace: true });
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-[22px] font-bold leading-none tracking-[-0.03em] text-[var(--color-dark)]">
          Authorise payment
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted,#737373)]">
          Total to authorise:{" "}
          <span className="font-semibold text-[var(--color-dark)]">
            {formatPrice(payment.amountPence)}
          </span>
        </p>
      </div>

      <div className="page-card p-5">
        <StripeProvider
          publishableKey={payment.publishableKey}
          clientSecret={payment.clientSecret}
        >
          <PaymentForm
            returnUrl={returnUrl}
            amountLabel={formatPrice(payment.amountPence)}
            onAuthorized={handleAuthorized}
            onCancel={onBack}
          />
        </StripeProvider>
      </div>
    </div>
  );
}
