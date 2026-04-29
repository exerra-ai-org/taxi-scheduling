import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { authMiddleware } from "../middleware/auth";
import { subscribe } from "../services/broadcaster";
import type { JwtPayload } from "../middleware/auth";
import type { BroadcastEvent } from "../services/broadcaster";

export const eventsRoutes = new Hono();

eventsRoutes.get("/", authMiddleware, (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;

  return streamSSE(c, async (stream) => {
    const pending: BroadcastEvent[] = [];
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
        while (pending.length > 0) {
          const event = pending.shift()!;
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
