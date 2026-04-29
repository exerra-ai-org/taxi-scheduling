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
  | { type: "ping" };

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

    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as RealtimeEvent;
        if (event.type === "ping") return;
        handlers.current.get(event.type)?.forEach((h) => h(event));
      } catch {}
    };

    // EventSource reconnects automatically on error — no manual handling needed
    return () => es.close();
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
