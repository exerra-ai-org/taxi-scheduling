import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { DriverLocation } from "shared/types";
import { useRealtimeEvent } from "../../context/RealtimeContext";
import { config } from "../../config";

interface Coords {
  lat: number;
  lon: number;
}

const TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

function pickupIcon() {
  return L.divIcon({
    html: '<div style="background:#98fe00;width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#131313;font-family:Roboto Mono,monospace;font-weight:700;font-size:10px;border:1px solid #131313;box-shadow:0 6px 14px rgba(19,19,19,.16)">P</div>',
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
function dropoffIcon() {
  return L.divIcon({
    html: '<div style="background:#131313;width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#98fe00;font-family:Roboto Mono,monospace;font-weight:700;font-size:10px;border:1px solid #98fe00;box-shadow:0 6px 14px rgba(19,19,19,.16)">D</div>',
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
function driverIcon() {
  return L.divIcon({
    html: `<div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center"><span style="position:absolute;inset:0;border-radius:50%;background:rgba(152,254,0,0.45);animation:pulse-ring 1.5s ease-out infinite"></span><div style="position:relative;background:#131313;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#98fe00;font-family:Roboto Mono,monospace;font-weight:700;font-size:10px;border:2px solid #98fe00;box-shadow:0 6px 14px rgba(19,19,19,.2)">·</div></div>`,
    className: "driver-marker-glide",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function FitBounds({ points }: { points: Coords[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, points.map((p) => `${p.lat},${p.lon}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

interface Props {
  bookingId: number;
  pickup: Coords;
  dropoff: Coords;
  trackable: boolean;
  onUpdate?: (loc: DriverLocation) => void;
}

export default function LiveDriverMap({
  bookingId,
  pickup,
  dropoff,
  trackable,
  onUpdate,
}: Props) {
  const [driver, setDriver] = useState<DriverLocation | null>(null);
  const [route, setRoute] = useState<L.LatLngExpression[]>([]);

  // Static OSRM route between pickup and dropoff for the polyline.
  useEffect(() => {
    const url = `${config.osrmUrl}/route/v1/driving/${pickup.lon},${pickup.lat};${dropoff.lon},${dropoff.lat}?overview=full&geometries=geojson`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.routes?.[0]) {
          setRoute(
            data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]] as L.LatLngExpression,
            ),
          );
        }
      })
      .catch(() => {
        setRoute([
          [pickup.lat, pickup.lon],
          [dropoff.lat, dropoff.lon],
        ]);
      });
  }, [pickup.lat, pickup.lon, dropoff.lat, dropoff.lon]);

  useRealtimeEvent("driver_location", (e) => {
    if (!trackable || e.bookingId !== bookingId) return;
    setDriver((prev) => {
      const loc = {
        lat: e.lat,
        lon: e.lon,
        lastUpdatedAt: e.updatedAt,
        distanceMiles: prev?.distanceMiles ?? null,
      };
      onUpdate?.(loc);
      return loc;
    });
  });

  const driverCoords =
    driver && driver.lat != null && driver.lon != null
      ? { lat: driver.lat, lon: driver.lon }
      : null;
  const fitPoints = [pickup, dropoff, ...(driverCoords ? [driverCoords] : [])];

  const center: L.LatLngExpression = [
    (pickup.lat + dropoff.lat) / 2,
    (pickup.lon + dropoff.lon) / 2,
  ];

  return (
    <div className="map-shell h-[320px] w-full">
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={TILES} attribution={TILE_ATTR} />
        <FitBounds points={fitPoints} />
        <Marker position={[pickup.lat, pickup.lon]} icon={pickupIcon()} />
        <Marker position={[dropoff.lat, dropoff.lon]} icon={dropoffIcon()} />
        {driverCoords && (
          <Marker
            position={[driverCoords.lat, driverCoords.lon]}
            icon={driverIcon()}
          />
        )}
        {route.length > 0 && (
          <Polyline
            positions={route}
            pathOptions={{ color: "#131313", weight: 4, opacity: 0.75 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
