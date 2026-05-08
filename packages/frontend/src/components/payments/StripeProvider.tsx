import { useMemo, type ReactNode } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

/**
 * Cache one Stripe.js instance per publishable key for the lifetime of
 * the tab. loadStripe() is heavy (network fetch + global init) so we
 * memoise on the key — switching keys mid-session is extremely rare
 * (test→live in dev only) but the memo handles it cleanly.
 */
const cache = new Map<string, Promise<Stripe | null>>();
function stripePromise(publishableKey: string): Promise<Stripe | null> {
  let p = cache.get(publishableKey);
  if (!p) {
    p = loadStripe(publishableKey);
    cache.set(publishableKey, p);
  }
  return p;
}

interface Props {
  publishableKey: string;
  clientSecret: string;
  children: ReactNode;
}

/**
 * Wraps children in Stripe's <Elements> provider with our themed
 * Appearance API config. Mount this inside the booking flow once we
 * have a `clientSecret` from the backend; child <PaymentElement /> can
 * then render the real card form.
 */
export default function StripeProvider({
  publishableKey,
  clientSecret,
  children,
}: Props) {
  const promise = useMemo(() => stripePromise(publishableKey), [publishableKey]);

  return (
    <Elements
      stripe={promise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            // Pull primary brand colors from the existing design tokens
            // so the embedded form doesn't look bolted on.
            colorPrimary: "#0a0a0a",
            colorBackground: "#ffffff",
            colorText: "#0a0a0a",
            colorDanger: "#b91c1c",
            fontFamily: "Inter, system-ui, sans-serif",
            borderRadius: "12px",
            spacingUnit: "4px",
          },
          rules: {
            ".Input": {
              border: "1px solid var(--color-border, #e5e7eb)",
              boxShadow: "none",
              padding: "12px",
            },
            ".Input:focus": {
              borderColor: "#0a0a0a",
              boxShadow: "0 0 0 1px #0a0a0a",
            },
            ".Label": {
              fontSize: "12px",
              fontWeight: "600",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#525252",
            },
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
