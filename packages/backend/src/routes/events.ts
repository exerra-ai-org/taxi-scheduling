import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { authMiddleware } from "../middleware/auth";
import { subscribe } from "../services/broadcaster";
import { createBoundedQueue } from "../lib/boundedQueue";
import type { JwtPayload } from "../middleware/auth";
import type { BroadcastEvent } from "../services/broadcaster";

export const eventsRoutes = new Hono();

// A slow client must not be able to hold unbounded memory in the server.
// At 500 events the consumer has clearly fallen behind — we drop oldest and
// signal overflow so the client refetches state instead of trying to play
// catch-up via the stream.
const QUEUE_MAX = 500;

eventsRoutes.get("/", authMiddleware, (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;

  return streamSSE(c, async (stream) => {
    const pending = createBoundedQueue<BroadcastEvent>({
      max: QUEUE_MAX,
      overflowSentinel: { type: "overflow" },
    });
    let resolver: (() => void) | null = null;

    const enqueue = (event: BroadcastEvent) => {
      pending.push(event);
      resolver?.();
      resolver = null;
    };

    const unsub = subscribe(payload.sub, payload.role, enqueue);

    // Keep the connection alive; browsers close EventSource after ~45s of silence
    const ping = setInterval(() => enqueue({ type: "ping" }), 25_000);

    await stream.writeSSE({ data: JSON.stringify({ type: "connected" }) });

    try {
      while (true) {
        const drained = pending.drain();
        for (const event of drained) {
          await stream.writeSSE({ data: JSON.stringify(event) });
        }
        await new Promise<void>((r) => {
          resolver = r;
        });
      }
    } catch {
      // stream closed by client
    } finally {
      clearInterval(ping);
      unsub();
    }
  });
});
