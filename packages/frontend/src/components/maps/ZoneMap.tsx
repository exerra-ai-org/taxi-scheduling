import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polygon, Tooltip } from "react-leaflet";
import { listZones } from "../../api/zones";
import type { Zone } from "shared/types";
import L from "leaflet";

const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

const ZONE_COLORS = [
  "#3b82f6",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#ec4899",
];

const LONDON_CENTER: L.LatLngExpression = [51.5074, -0.1278];

export default function ZoneMap() {
  const [zones, setZones] = useState<Zone[]>([]);

  useEffect(() => {
    listZones()
      .then((d) => setZones(d.zones))
      .catch(() => {});
  }, []);

  return (
    <div className="map-shell h-72 w-full">
      <MapContainer
        center={LONDON_CENTER}
        zoom={9}
        className="w-full h-full"
        zoomControl
        attributionControl={false}
      >
        <TileLayer url={DARK_TILES} />
        {zones.map((zone, i) => {
          const color = ZONE_COLORS[i % ZONE_COLORS.length];
          const boundary = zone.boundary as {
            type: string;
            coordinates: number[][][];
          } | null;
          if (!boundary || boundary.type !== "Polygon") return null;
          const positions: L.LatLngExpression[] = boundary.coordinates[0].map(
            ([lon, lat]) => [lat, lon] as L.LatLngExpression,
          );
          if (positions.length === 0) return null;
          return (
            <Polygon
              key={zone.id}
              positions={positions}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.15,
                weight: 2,
                opacity: 0.8,
              }}
            >
              <Tooltip>{zone.label}</Tooltip>
            </Polygon>
          );
        })}
      </MapContainer>
    </div>
  );
}
