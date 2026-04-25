import { api } from "./client";

export function getPublicKey() {
  return api.get<{ publicKey: string }>("/api/notifications/public-key");
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  createdAt: string;
}

export function listSubscriptions() {
  return api.get<{ subscriptions: PushSubscriptionRow[] }>(
    "/api/notifications/subscriptions",
  );
}

export function subscribe(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  return api.post<{ subscription: PushSubscriptionRow }>(
    "/api/notifications/subscribe",
    input,
  );
}

export function unsubscribe(endpoint: string) {
  return api.post<{ message: string }>("/api/notifications/unsubscribe", {
    endpoint,
  });
}
