export type BroadcastEvent =
  | { type: "booking_created"; bookingId: number; customerId: number }
  | { type: "booking_updated"; bookingId: number; status: string }
  | {
      type: "driver_location";
      bookingId: number;
      lat: number;
      lon: number;
      updatedAt: string;
    }
  | { type: "drivers_assigned"; bookingId: number }
  | { type: "booking_cancelled"; bookingId: number }
  | { type: "ping" }
  | { type: "overflow" };

type Callback = (event: BroadcastEvent) => void;

interface Subscriber {
  callback: Callback;
  role: string;
}

// userId → Set of active SSE connections for that user
const connections = new Map<number, Set<Subscriber>>();

export function subscribe(
  userId: number,
  role: string,
  callback: Callback,
): () => void {
  if (!connections.has(userId)) connections.set(userId, new Set());
  const sub: Subscriber = { callback, role };
  connections.get(userId)!.add(sub);
  return () => {
    const subs = connections.get(userId);
    if (!subs) return;
    subs.delete(sub);
    if (subs.size === 0) connections.delete(userId);
  };
}

// Send to specific users + all connected admins (admins always see everything).
// Deduplicates so admins in userIds don't receive it twice.
export function broadcastBookingEvent(
  userIds: number[],
  event: BroadcastEvent,
): void {
  const notified = new Set<number>();

  for (const userId of userIds) {
    connections.get(userId)?.forEach((sub) => {
      try {
        sub.callback(event);
      } catch {}
    });
    notified.add(userId);
  }

  // Also push to every admin who isn't already in userIds
  for (const [userId, subs] of connections) {
    if (notified.has(userId)) continue;
    subs.forEach((sub) => {
      if (sub.role === "admin") {
        try {
          sub.callback(event);
        } catch {}
      }
    });
  }
}
