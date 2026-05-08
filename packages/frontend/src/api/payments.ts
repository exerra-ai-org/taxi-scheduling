import { api } from "./client";

export interface PaymentConfig {
  enabled: boolean;
  publishableKey: string;
  currency: string;
}

export interface PaymentIntentResponse {
  clientSecret: string;
  intentId: string;
  intentType: "payment_intent" | "setup_intent";
  amountPence: number;
  publishableKey: string;
}

export interface PaymentIntentStatus {
  intentId: string;
  bookingId: number;
  status: string;
  amountPence: number;
  currency: string;
  lastErrorMessage: string | null;
}

export function getPaymentConfig() {
  return api.get<PaymentConfig>("/payments/config");
}

export function createPaymentIntent(bookingId: number) {
  return api.post<PaymentIntentResponse>("/payments/intent", { bookingId });
}

export function getPaymentIntent(intentId: string) {
  return api.get<PaymentIntentStatus>(`/payments/intent/${intentId}`);
}
