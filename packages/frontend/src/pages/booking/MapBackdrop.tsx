import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

const TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

const UK_CENTER: L.LatLngExpression = [54.5, -2.5];
const UK_ZOOM = 6;

export interface Coords {
  lat: number;
  lon: number;
}

export type ActiveField = "pickup" | "dropoff" | null;

function pickupIcon() {
  return L.divIcon({
    html: '<div style="background:#98fe00;width:36px;height:36px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#131313;font-family:Roboto Mono,monospace;font-weight:700;font-size:14px;border:1px solid #131313;box-shadow:0 8px 20px rgba(19,19,19,.18)">P</div>',
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function dropoffIcon() {
  return L.divIcon({
    html: '<div style="background:#131313;width:36px;height:36px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#98fe00;font-family:Roboto Mono,monospace;font-weight:700;font-size:14px;border:1px solid #98fe00;box-shadow:0 8px 20px rgba(19,19,19,.18)">D</div>',
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function driverIcon() {
  return L.divIcon({
    html: '<div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center"><span style="position:absolute;inset:0;border-radius:50%;background:rgba(152,254,0,0.45);animation:pulse-ring 1.5s ease-out infinite"></span><div style="position:relative;background:#131313;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#98fe00;font-family:Roboto Mono,monospace;font-weight:700;font-size:10px;border:2px solid #98fe00;box-shadow:0 6px 14px rgba(19,19,19,.2)">·</div></div>',
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export interface ObstructPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

interface ControllerProps {
  pickup: Coords | null;
  dropoff: Coords | null;
  activeField: ActiveField;
  obstruct: ObstructPadding;
  onMapClick?: (lat: number, lng: number) => void;
}

function Controller({
  pickup,
  dropoff,
  activeField,
  obstruct,
  onMapClick,
}: ControllerProps) {
  const map = useMap();
  const lastFitKey = useRef<string>("");

  // Fit bounds ONCE per unique pickup+dropoff pair. Padding reserves space for
  // the floating panel so the route never slides under it. Re-fits don't fire
  // on driver-location polls, panel resizes, or step transitions.
  useEffect(() => {
    if (!pickup || !dropoff) {
      lastFitKey.current = "";
      return;
    }
    const key = `${pickup.lat},${pickup.lon}|${dropoff.lat},${dropoff.lon}`;
    if (key === lastFitKey.current) return;
    lastFitKey.current = key;
    const bounds = L.latLngBounds(
      [pickup.lat, pickup.lon],
      [dropoff.lat, dropoff.lon],
    );
    const top = obstruct.top ?? 60;
    const left = obstruct.left ?? 60;
    const bottom = obstruct.bottom ?? 60;
    const right = obstruct.right ?? 60;
    map.fitBounds(bounds, {
      paddingTopLeft: [left, top],
      paddingBottomRight: [right, bottom],
      maxZoom: 14,
    });
    // obstruct intentionally read but not in deps — only its value at fit
    // time matters, never to trigger a re-fit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pickup?.lat, pickup?.lon, dropoff?.lat, dropoff?.lon]);

  // Cursor when picking
  useEffect(() => {
    if (activeField) map.getContainer().style.cursor = "crosshair";
    else map.getContainer().style.cursor = "";
    return () => {
      map.getContainer().style.cursor = "";
    };
  }, [map, activeField]);

  useMapEvents({
    click(e) {
      if (activeField && onMapClick) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
}

interface MapBackdropProps {
  pickup: Coords | null;
  dropoff: Coords | null;
  driver?: Coords | null;
  activeField?: ActiveField;
  onMapClick?: (lat: number, lng: number) => void;
  onPickupDrag?: (c: Coords) => void;
  onDropoffDrag?: (c: Coords) => void;
  /**
   * Pixel padding to reserve around the fitted bounds for floating chrome
   * (e.g. side panel, bottom sheet). Right is for desktop side-anchored
   * panels; bottom is for mobile bottom sheets.
   */
  obstruct?: ObstructPadding;
  interactive?: boolean;
}

export default function MapBackdrop({
  pickup,
  dropoff,
  driver = null,
  activeField = null,
  onMapClick,
  onPickupDrag,
  onDropoffDrag,
  obstruct = {},
  interactive = true,
}: MapBackdropProps) {
  const [route, setRoute] = useState<L.LatLngExpression[]>([]);

  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoute([]);
      return;
    }
    const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lon},${pickup.lat};${dropoff.lon},${dropoff.lat}?overview=full&geometries=geojson`;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.routes?.[0]) {
          setRoute(
            data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]] as L.LatLngExpression,
            ),
          );
        } else {
          setRoute([
            [pickup.lat, pickup.lon],
            [dropoff.lat, dropoff.lon],
          ]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRoute([
          [pickup.lat, pickup.lon],
          [dropoff.lat, dropoff.lon],
        ]);
      });
    return () => {
      cancelled = true;
    };
  }, [pickup?.lat, pickup?.lon, dropoff?.lat, dropoff?.lon]);

  const handleMapClickWrapped = useCallback(
    (lat: number, lng: number) => {
      onMapClick?.(lat, lng);
    },
    [onMapClick],
  );

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={UK_CENTER}
        zoom={UK_ZOOM}
        className="h-full w-full"
        zoomControl={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        dragging={interactive}
        attributionControl={false}
      >
        <TileLayer url={TILES} attribution={TILE_ATTR} />
        <Controller
          pickup={pickup}
          dropoff={dropoff}
          activeField={activeField}
          obstruct={obstruct}
          onMapClick={handleMapClickWrapped}
        />
        {pickup && (
          <Marker
            position={[pickup.lat, pickup.lon]}
            icon={pickupIcon()}
            draggable={!!onPickupDrag}
            eventHandlers={
              onPickupDrag
                ? {
                    dragend: (e) => {
                      const ll = e.target.getLatLng();
                      onPickupDrag({ lat: ll.lat, lon: ll.lng });
                    },
                  }
                : undefined
            }
          />
        )}
        {dropoff && (
          <Marker
            position={[dropoff.lat, dropoff.lon]}
            icon={dropoffIcon()}
            draggable={!!onDropoffDrag}
            eventHandlers={
              onDropoffDrag
                ? {
                    dragend: (e) => {
                      const ll = e.target.getLatLng();
                      onDropoffDrag({ lat: ll.lat, lon: ll.lng });
                    },
                  }
                : undefined
            }
          />
        )}
        {driver && (
          <Marker position={[driver.lat, driver.lon]} icon={driverIcon()} />
        )}
        {route.length > 0 && (
          <Polyline
            positions={route}
            pathOptions={{ color: "#131313", weight: 4, opacity: 0.8 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
