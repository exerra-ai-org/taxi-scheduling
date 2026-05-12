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
  | {
      type: "driver_presence";
      driverId: number;
      isOnDuty: boolean;
      lat: number | null;
      lon: number | null;
      lastSeenAt: string;
    }
  | { type: "drivers_assigned"; bookingId: number }
  | { type: "booking_cancelled"; bookingId: number }
  | {
      type: "incident_reported";
      bookingId: number;
      incidentType: "emergency" | "contact_admin";
    }
  | { type: "user_updated"; userId: number }
  | { type: "driver_profile_updated"; driverId: number }
  | {
      type: "payment_status_changed";
      bookingId: number;
      paymentStatus: string;
      lastErrorMessage?: string | null;
    }
  | {
      type: "customer_arrived";
      bookingId: number;
      customerArrivedAt: string;
      waitingFeePence: number;
    }
  | { type: "ping" }
  | { type: "overflow" };

import { config } from "../config";

type Callback = (event: BroadcastEvent) => void;

interface Subscriber {
  callback: Callback;
  role: string;
}

// userId → Set of active SSE connections for that user.
//
// `bun --hot` re-imports this module on every save. A fresh `new Map()`
// here would orphan every existing SSE subscription registered against
// the previous module instance, and broadcasts would silently drop. Pin
// the Map to globalThis in non-production so re-imports reuse the same
// registry. Production loads the module exactly once, so a normal
// module-local Map is fine and avoids leaking refs into globalThis.
const globalForBroadcaster = globalThis as unknown as {
  __broadcasterConnections?: Map<number, Set<Subscriber>>;
};

const connections: Map<number, Set<Subscriber>> = config.isProduction
  ? new Map<number, Set<Subscriber>>()
  : (globalForBroadcaster.__broadcasterConnections ??= new Map<
      number,
      Set<Subscriber>
    >());

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
