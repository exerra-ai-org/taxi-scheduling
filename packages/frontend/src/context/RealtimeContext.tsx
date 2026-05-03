import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { config } from "../config";
import { useAuth } from "./AuthContext";

export type RealtimeEvent =
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
  | { type: "ping" }
  | { type: "overflow" };

type AnyHandler = (event: RealtimeEvent) => void;

interface RealtimeCtx {
  on: <T extends RealtimeEvent["type"]>(
    type: T,
    handler: (event: Extract<RealtimeEvent, { type: T }>) => void,
  ) => () => void;
}

const RealtimeContext = createContext<RealtimeCtx | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const handlers = useRef(new Map<string, Set<AnyHandler>>());

  useEffect(() => {
    if (!user) return;

    const es = new EventSource(`${config.apiBase}/events`, {
      withCredentials: true,
    });

    // EventSource auto-reconnects after transient errors (network blip,
    // proxy idle-close, server restart). Browsers do this silently, so
    // events that fired *during* the gap are simply lost — that's how we
    // saw "had to refresh" symptoms even though the page was on-screen.
    // We track open/error transitions and synthesize an overflow event
    // on reconnect so subscribers refetch their state from the canonical
    // source.
    //
    // Fan-out semantics: overflow ONLY fires handlers explicitly
    // subscribed to type "overflow" (i.e. via useRealtimeRecovery).
    // Earlier we fanned out to every registered handler regardless of
    // type, which caused content-aware handlers (e.g. the SOS toast
    // reading e.bookingId) to run with undefined fields and produce
    // nonsense like "Booking #undefined". Pages that want recovery on
    // overflow now opt in explicitly.
    const fireOverflow = () => {
      const overflowEvent: RealtimeEvent = { type: "overflow" };
      handlers.current.get("overflow")?.forEach((h) => h(overflowEvent));
    };

    let wasOpen = false;
    es.onopen = () => {
      if (wasOpen) fireOverflow();
      wasOpen = true;
    };
    es.onerror = () => {
      // EventSource will auto-reconnect; we don't close it here. The
      // onopen above handles the recovery once reconnection completes.
    };

    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as RealtimeEvent;
        if (event.type === "ping") return;
        if (event.type === "overflow") {
          fireOverflow();
          return;
        }
        handlers.current.get(event.type)?.forEach((h) => h(event));
      } catch {}
    };

    // Belt-and-braces: when the tab returns to visible after being
    // hidden (mobile lock, switched tabs), also fire overflow. Browsers
    // will sometimes pause/resume EventSource on visibility changes
    // without surfacing a clean error → open transition we can detect.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      fireOverflow();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      es.close();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user]);

  const on = useCallback(
    <T extends RealtimeEvent["type"]>(
      type: T,
      handler: (event: Extract<RealtimeEvent, { type: T }>) => void,
    ) => {
      const map = handlers.current;
      if (!map.has(type)) map.set(type, new Set());
      map.get(type)!.add(handler as AnyHandler);
      return () => map.get(type)?.delete(handler as AnyHandler);
    },
    [],
  );

  return (
    <RealtimeContext.Provider value={{ on }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeCtx {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within RealtimeProvider");
  return ctx;
}

// Convenience hook: subscribe for the lifetime of the calling component.
export function useRealtimeEvent<T extends RealtimeEvent["type"]>(
  type: T,
  handler: (event: Extract<RealtimeEvent, { type: T }>) => void,
): void {
  const { on } = useRealtime();
  useEffect(() => on(type, handler), [on, type, handler]);
}

// Recovery hook: fires when the SSE pipeline says "you may have missed
// events" — server-side overflow, network drop + reconnect, or visibility
// resume. Pages with *filtered* subscribers (e.g. "if e.bookingId ===
// myId") should call this with their refetch function so a missed event
// during a gap still gets reconciled.
export function useRealtimeRecovery(refetch: () => void): void {
  const { on } = useRealtime();
  useEffect(() => on("overflow", refetch), [on, refetch]);
}
