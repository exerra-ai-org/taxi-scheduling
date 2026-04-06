import { api } from "./client";

export async function getNotificationPublicKey() {
  return api.get<{ publicKey: string }>("/api/notifications/public-key");
}

export async function subscribeNotifications(data: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  return api.post<{ subscription: { id: number; endpoint: string } }>(
    "/api/notifications/subscribe",
    data,
  );
}

export async function unsubscribeNotifications(endpoint: string) {
  return api.post<{ message: string }>("/api/notifications/unsubscribe", {
    endpoint,
  });
}

export async function listNotificationSubscriptions() {
  return api.get<{
    subscriptions: Array<{ id: number; endpoint: string; createdAt: string }>;
  }>("/api/notifications/subscriptions");
}
