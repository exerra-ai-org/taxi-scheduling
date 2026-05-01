import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { config } from "../../config";

interface Coords {
  lat: number;
  lon: number;
}

const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

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

function FitRoute({ pickup, dropoff }: { pickup: Coords; dropoff: Coords }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(
      [pickup.lat, pickup.lon],
      [dropoff.lat, dropoff.lon],
    );
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, pickup.lat, pickup.lon, dropoff.lat, dropoff.lon]);
  return null;
}

interface RouteMapProps {
  pickup: Coords;
  dropoff: Coords;
}

export default function RouteMap({ pickup, dropoff }: RouteMapProps) {
  const [route, setRoute] = useState<L.LatLngExpression[]>([]);

  useEffect(() => {
    const url = `${config.osrmUrl}/route/v1/driving/${pickup.lon},${pickup.lat};${dropoff.lon},${dropoff.lat}?overview=full&geometries=geojson`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.routes?.[0]) {
          const coords = data.routes[0].geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]] as L.LatLngExpression,
          );
          setRoute(coords);
        }
      })
      .catch(() => {
        // Fallback: straight line
        setRoute([
          [pickup.lat, pickup.lon],
          [dropoff.lat, dropoff.lon],
        ]);
      });
  }, [pickup.lat, pickup.lon, dropoff.lat, dropoff.lon]);

  const center: L.LatLngExpression = [
    (pickup.lat + dropoff.lat) / 2,
    (pickup.lon + dropoff.lon) / 2,
  ];

  return (
    <div className="map-shell h-48 w-full">
      <MapContainer
        center={center}
        zoom={10}
        className="w-full h-full"
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <TileLayer url={DARK_TILES} />
        <FitRoute pickup={pickup} dropoff={dropoff} />
        <Marker position={[pickup.lat, pickup.lon]} icon={pickupIcon()} />
        <Marker position={[dropoff.lat, dropoff.lon]} icon={dropoffIcon()} />
        {route.length > 0 && (
          <Polyline
            positions={route}
            pathOptions={{
              color: "#131313",
              weight: 4,
              opacity: 0.8,
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
