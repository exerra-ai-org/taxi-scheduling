import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { LiveDriver } from "shared/types";
import {
  getBookingPath,
  listLiveDrivers,
  type BookingPathPoint,
} from "../../api/drivers";
import { useRealtimeEvent } from "../../context/RealtimeContext";
import { snapBreadcrumb } from "../../lib/snapBreadcrumb";
import { config } from "../../config";

const TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

// Treat absence-from-server-feed as still live for this long, so a single
// dropped poll cycle doesn't yank a driver off the map.
const REFRESH_MS = 15_000;

// London / Luton bounding fallback for the initial view when no drivers
// have yet reported. Centered roughly on Luton Airport.
const FALLBACK_CENTER: [number, number] = [51.8747, -0.3683];

interface DriverMarker extends LiveDriver {
  // Track whether this entry came from the periodic refetch (canonical) or
  // an SSE patch on top of it. Both render identically — the field exists
  // so future logic can prefer canonical data on conflicts.
  source: "fetch" | "sse";
}

function idleIcon(initials: string) {
  return L.divIcon({
    html: `<div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center"><div style="background:#131313;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-family:Roboto Mono,monospace;font-weight:700;font-size:11px;border:2px solid #98fe00;box-shadow:0 6px 14px rgba(19,19,19,.2)">${initials}</div></div>`,
    className: "driver-marker-glide",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function onRideIcon(initials: string) {
  return L.divIcon({
    html: `<div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center"><span style="position:absolute;inset:0;border-radius:50%;background:rgba(255,140,0,0.45);animation:pulse-ring 1.5s ease-out infinite;color:#ff8c00"></span><div style="position:relative;background:#ff8c00;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#131313;font-family:Roboto Mono,monospace;font-weight:700;font-size:11px;border:2px solid #131313;box-shadow:0 6px 14px rgba(19,19,19,.2)">${initials}</div></div>`,
    className: "driver-marker-glide",
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
  }, [map, points.map((p) => p.join(",")).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function LiveDriversMap() {
  const [drivers, setDrivers] = useState<Map<number, DriverMarker>>(new Map());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [route, setRoute] = useState<L.LatLngExpression[]>([]);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BookingPathPoint[]>([]);
  const [snapped, setSnapped] = useState<L.LatLngExpression[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { drivers: list } = await listLiveDrivers();
      setDrivers((prev) => {
        const next = new Map<number, DriverMarker>();
        for (const d of list) next.set(d.driverId, { ...d, source: "fetch" });
        // Preserve any SSE-only updates that arrived more recently than the
        // last canonical fetch. Cheap heuristic: if a driver is in `prev`
        // but not in `list`, drop them — server says they're no longer live.
        return next;
      });
    } catch {
      // transient — next refresh will retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // SSE: driver toggled on/off duty, or location moved. We patch local state
  // so the map updates between refresh cycles.
  useRealtimeEvent("driver_presence", (e) => {
    setDrivers((prev) => {
      const next = new Map(prev);
      if (!e.isOnDuty || e.lat == null || e.lon == null) {
        next.delete(e.driverId);
        return next;
      }
      const existing = next.get(e.driverId);
      next.set(e.driverId, {
        driverId: e.driverId,
        name: existing?.name ?? `Driver #${e.driverId}`,
        phone: existing?.phone ?? null,
        vehicle: existing?.vehicle ?? null,
        lat: e.lat,
        lon: e.lon,
        lastSeenAt: e.lastSeenAt,
        isOnDuty: true,
        activeBooking: existing?.activeBooking ?? null,
        source: "sse",
      });
      return next;
    });
  });

  useRealtimeEvent("driver_location", (e) => {
    // driver_location is per-booking, not per-driver. We can't map booking →
    // driver without an extra cache, so just trigger a refetch to pick up the
    // canonical positions. Cheap (~few ms) and keeps things consistent.
    refresh();
    // If the moving driver is the one we're inspecting, extend the
    // breadcrumb client-side instead of refetching the whole path.
    setBreadcrumb((prev) => {
      const sel = selectedId != null ? drivers.get(selectedId) : null;
      if (!sel?.activeBooking || sel.activeBooking.id !== e.bookingId) {
        return prev;
      }
      const last = prev[prev.length - 1];
      if (last && last.lat === e.lat && last.lon === e.lon) return prev;
      return [
        ...prev,
        {
          lat: e.lat,
          lon: e.lon,
          accuracyM: null,
          speedMps: null,
          recordedAt: e.updatedAt,
        },
      ];
    });
  });

  // Re-fetch on assignment changes too — driver's activeBooking just changed.
  useRealtimeEvent("drivers_assigned", refresh);
  useRealtimeEvent("booking_updated", refresh);
  useRealtimeEvent("booking_cancelled", refresh);

  const driverList = useMemo(() => Array.from(drivers.values()), [drivers]);
  const selected =
    selectedId != null ? (drivers.get(selectedId) ?? null) : null;

  // Run the breadcrumb through OSRM map-matching so the rendered polyline
  // follows actual roads instead of drawing straight lines between raw GPS
  // fixes. Debounced so a burst of SSE updates produces one request, not
  // many. On failure (rate limit, OSRM down) the raw thinned points are
  // returned and we still get something useful.
  useEffect(() => {
    if (breadcrumb.length < 2) {
      setSnapped([]);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      snapBreadcrumb(breadcrumb, ac.signal).then((path) => {
        if (!ac.signal.aborted) setSnapped(path);
      });
    }, 1500);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [breadcrumb]);

  // Fetch the actual breadcrumb (recorded GPS trail) for the selected booking.
  // Re-fetched whenever the selection changes; subsequent driver_location SSE
  // events extend it in place to avoid hammering the endpoint. If the server
  // returns a cached snappedPath (completed rides), we use it directly and
  // skip client-side snapping entirely.
  useEffect(() => {
    if (!selected?.activeBooking) {
      setBreadcrumb([]);
      setSnapped([]);
      return;
    }
    const bookingId = selected.activeBooking.id;
    let cancelled = false;
    getBookingPath(bookingId)
      .then(({ points, snappedPath }) => {
        if (cancelled) return;
        if (snappedPath && snappedPath.length > 1) {
          setBreadcrumb([]);
          setSnapped(
            snappedPath.map(([lat, lon]) => [lat, lon] as L.LatLngExpression),
          );
        } else {
          setBreadcrumb(points);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBreadcrumb([]);
          setSnapped([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.activeBooking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the planned pickup→dropoff polyline whenever we select an on-ride
  // driver. We cache nothing: the polyline is small and OSRM is fast.
  const lastFetchedBookingRef = useRef<number | null>(null);
  useEffect(() => {
    setRouteError(null);
    if (!selected?.activeBooking) {
      setRoute([]);
      lastFetchedBookingRef.current = null;
      return;
    }
    const b = selected.activeBooking;
    if (
      b.pickupLat == null ||
      b.pickupLon == null ||
      b.dropoffLat == null ||
      b.dropoffLon == null
    ) {
      setRoute([]);
      setRouteError("Booking is missing pickup/dropoff coordinates");
      return;
    }
    if (lastFetchedBookingRef.current === b.id) return;
    lastFetchedBookingRef.current = b.id;

    const url = `${config.osrmUrl}/route/v1/driving/${b.pickupLon},${b.pickupLat};${b.dropoffLon},${b.dropoffLat}?overview=full&geometries=geojson`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.routes?.[0]) {
          setRoute(
            data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]] as L.LatLngExpression,
            ),
          );
        } else {
          setRoute([
            [b.pickupLat as number, b.pickupLon as number],
            [b.dropoffLat as number, b.dropoffLon as number],
          ]);
        }
      })
      .catch(() => {
        setRoute([
          [b.pickupLat as number, b.pickupLon as number],
          [b.dropoffLat as number, b.dropoffLon as number],
        ]);
      });
  }, [selected]);

  const fitPoints: [number, number][] = useMemo(() => {
    if (selected) {
      const pts: [number, number][] = [[selected.lat, selected.lon]];
      const b = selected.activeBooking;
      if (b?.pickupLat != null && b.pickupLon != null)
        pts.push([b.pickupLat, b.pickupLon]);
      if (b?.dropoffLat != null && b.dropoffLon != null)
        pts.push([b.dropoffLat, b.dropoffLon]);
      return pts;
    }
    return driverList.map((d) => [d.lat, d.lon]);
  }, [selected, driverList]);

  const onRideCount = driverList.filter((d) => d.activeBooking).length;

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="section-label">Admin</p>
          <h1 className="page-title">Live drivers</h1>
        </div>
        <div className="caption-copy text-[var(--color-muted)]">
          {loading
            ? "Loading…"
            : `${driverList.length} live · ${onRideCount} on a ride`}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="map-shell h-[560px] w-full">
          <MapContainer
            center={FALLBACK_CENTER}
            zoom={11}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer url={TILES} attribution={TILE_ATTR} />
            <FitBounds points={fitPoints} />

            {driverList.map((d) => {
              const onRide = Boolean(d.activeBooking);
              const initials = initialsOf(d.name);
              const icon = onRide ? onRideIcon(initials) : idleIcon(initials);
              return (
                <Marker
                  key={d.driverId}
                  position={[d.lat, d.lon]}
                  icon={icon}
                  eventHandlers={{
                    click: () => setSelectedId(d.driverId),
                  }}
                />
              );
            })}

            {selected?.activeBooking?.pickupLat != null &&
              selected.activeBooking.pickupLon != null && (
                <Marker
                  position={[
                    selected.activeBooking.pickupLat,
                    selected.activeBooking.pickupLon,
                  ]}
                  icon={L.divIcon({
                    html: '<div style="background:#98fe00;width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#131313;font-family:Roboto Mono,monospace;font-weight:700;font-size:10px;border:1px solid #131313">P</div>',
                    className: "",
                    iconSize: [22, 22],
                    iconAnchor: [11, 11],
                  })}
                />
              )}
            {selected?.activeBooking?.dropoffLat != null &&
              selected.activeBooking.dropoffLon != null && (
                <Marker
                  position={[
                    selected.activeBooking.dropoffLat,
                    selected.activeBooking.dropoffLon,
                  ]}
                  icon={L.divIcon({
                    html: '<div style="background:#131313;width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#98fe00;font-family:Roboto Mono,monospace;font-weight:700;font-size:10px;border:1px solid #98fe00">D</div>',
                    className: "",
                    iconSize: [22, 22],
                    iconAnchor: [11, 11],
                  })}
                />
              )}

            {selected && route.length > 0 && (
              <Polyline
                positions={route}
                pathOptions={{
                  color: "#131313",
                  weight: 4,
                  opacity: 0.45,
                  dashArray: "6 8",
                }}
              />
            )}

            {selected &&
              (snapped.length > 1 ? (
                <Polyline
                  positions={snapped}
                  pathOptions={{ color: "#ff8c00", weight: 5, opacity: 0.9 }}
                />
              ) : breadcrumb.length > 1 ? (
                // Fallback while we wait for the snap result, or if the
                // OSRM match failed and we couldn't road-snap.
                <Polyline
                  positions={breadcrumb.map(
                    (p) => [p.lat, p.lon] as L.LatLngExpression,
                  )}
                  pathOptions={{ color: "#ff8c00", weight: 4, opacity: 0.5 }}
                />
              ) : null)}
          </MapContainer>
        </div>

        <aside className="space-y-3">
          {selected ? (
            <DriverPanel
              driver={selected}
              routeError={routeError}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="card-pad">
              <p className="section-label">Tip</p>
              <p className="body-copy">
                Click any driver marker to inspect their status. On-ride drivers
                are highlighted in orange and show their planned pickup →
                dropoff route.
              </p>
              <p className="caption-copy text-[var(--color-muted)] mt-3">
                Drivers count as live for 2 min after their last ping. The feed
                refreshes every {REFRESH_MS / 1000}s and patches in real time
                via SSE.
              </p>
            </div>
          )}

          <div className="card-pad">
            <p className="section-label">All live ({driverList.length})</p>
            <ul className="space-y-2 mt-2">
              {driverList.map((d) => (
                <li key={d.driverId}>
                  <button
                    onClick={() => setSelectedId(d.driverId)}
                    className={`w-full text-left rounded-md px-2 py-1.5 transition ${
                      selectedId === d.driverId
                        ? "bg-[var(--color-surface-strong)]"
                        : "hover:bg-[var(--color-surface-soft)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{d.name}</span>
                      <span
                        className={`caption-copy ${
                          d.activeBooking
                            ? "text-[var(--color-orange)]"
                            : "text-[var(--color-muted)]"
                        }`}
                      >
                        {d.activeBooking
                          ? d.activeBooking.status.replace(/_/g, " ")
                          : "idle"}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
              {driverList.length === 0 && !loading && (
                <li className="caption-copy text-[var(--color-muted)]">
                  No drivers on duty right now.
                </li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DriverPanel({
  driver,
  routeError,
  onClose,
}: {
  driver: DriverMarker;
  routeError: string | null;
  onClose: () => void;
}) {
  const b = driver.activeBooking;
  const seen = new Date(driver.lastSeenAt);
  const seenAgo = Math.max(0, Math.round((Date.now() - seen.getTime()) / 1000));
  return (
    <div className="card-pad space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label">Driver</p>
          <h2 className="text-lg font-semibold">{driver.name}</h2>
        </div>
        <button
          onClick={onClose}
          className="caption-copy text-[var(--color-muted)] underline"
        >
          Close
        </button>
      </div>

      {driver.phone && (
        <p className="body-copy">
          <a href={`tel:${driver.phone}`} className="underline">
            {driver.phone}
          </a>
        </p>
      )}

      {driver.vehicle &&
        (driver.vehicle.vehicleMake || driver.vehicle.licensePlate) && (
          <p className="caption-copy text-[var(--color-muted)]">
            {[
              driver.vehicle.vehicleColor,
              driver.vehicle.vehicleMake,
              driver.vehicle.vehicleModel,
            ]
              .filter(Boolean)
              .join(" ")}
            {driver.vehicle.licensePlate
              ? ` · ${driver.vehicle.licensePlate}`
              : ""}
          </p>
        )}

      <p className="caption-copy text-[var(--color-muted)]">
        Last ping {seenAgo}s ago
      </p>

      {b ? (
        <div className="border-t border-[var(--color-border)] pt-2 mt-2 space-y-1">
          <p className="section-label">On a ride</p>
          <p className="caption-copy">
            <span className="font-medium uppercase">
              {b.status.replace(/_/g, " ")}
            </span>
            {" · "}#{b.id}
          </p>
          <p className="body-copy">
            <span className="text-[var(--color-muted)]">From: </span>
            {b.pickupAddress}
          </p>
          <p className="body-copy">
            <span className="text-[var(--color-muted)]">To: </span>
            {b.dropoffAddress}
          </p>
          <p className="caption-copy text-[var(--color-muted)]">
            Customer: {b.customerName}
          </p>
          {routeError && (
            <p className="caption-copy text-[var(--color-orange)]">
              {routeError}
            </p>
          )}
        </div>
      ) : (
        <p className="body-copy text-[var(--color-muted)]">
          Idle — no active booking.
        </p>
      )}
    </div>
  );
}
