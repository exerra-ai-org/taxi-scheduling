import { useEffect, useState } from "react";
import { Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { listZones } from "../../api/zones";
import type { Zone } from "shared/types";

const ZONE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#ec4899",
];

function ZoneOverlays({ zones }: { zones: Zone[] }) {
  const map = useMap();
  const mapsLib = useMapsLibrary("maps");

  useEffect(() => {
    if (!map || !mapsLib || zones.length === 0) return;

    const polygons: google.maps.Polygon[] = [];

    zones.forEach((zone, i) => {
      if (!zone.boundary) return;

      const boundary = zone.boundary as {
        type: string;
        coordinates: number[][][];
      };
      if (boundary.type !== "Polygon") return;

      // GeoJSON is [lon, lat], Google Maps wants { lat, lng }
      const paths = boundary.coordinates[0].map(([lon, lat]) => ({
        lat,
        lng: lon,
      }));

      const color = ZONE_COLORS[i % ZONE_COLORS.length];
      const polygon = new google.maps.Polygon({
        paths,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.15,
        map,
      });

      // Info window on click
      const infoWindow = new google.maps.InfoWindow({
        content: `<div class="p-1 text-sm font-medium">${zone.label}</div>`,
      });

      polygon.addListener("click", (e: google.maps.MapMouseEvent) => {
        infoWindow.setPosition(e.latLng);
        infoWindow.open(map);
      });

      polygons.push(polygon);
    });

    return () => {
      polygons.forEach((p) => p.setMap(null));
    };
  }, [map, mapsLib, zones]);

  return null;
}

const LONDON_CENTER = { lat: 51.5074, lng: -0.1278 };

export default function ZoneMap() {
  const [zones, setZones] = useState<Zone[]>([]);

  useEffect(() => {
    listZones()
      .then((d) => setZones(d.zones))
      .catch(() => {});
  }, []);

  const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!API_KEY) {
    return (
      <div className="w-full h-64 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        Add VITE_GOOGLE_MAPS_API_KEY to enable zone map
      </div>
    );
  }

  return (
    <div className="w-full h-72 rounded-xl overflow-hidden border border-gray-200">
      <Map
        defaultCenter={LONDON_CENTER}
        defaultZoom={9}
        mapId="taxi-zone-map"
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
      >
        <ZoneOverlays zones={zones} />
      </Map>
    </div>
  );
}
