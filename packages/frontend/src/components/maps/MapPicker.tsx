import { useCallback, useEffect, useState } from "react";
import {
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

interface Coords {
  lat: number;
  lon: number;
}

interface MarkerProps {
  position: google.maps.LatLngLiteral;
  label: string;
  color: string;
  onDragEnd: (coords: Coords) => void;
}

function DraggableMarker({ position, label, color, onDragEnd }: MarkerProps) {
  const geocodingLib = useMapsLibrary("geocoding");
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

  useEffect(() => {
    if (geocodingLib) setGeocoder(new geocodingLib.Geocoder());
  }, [geocodingLib]);

  function handleDragEnd(e: google.maps.MapMouseEvent) {
    const latLng = e.latLng;
    if (!latLng) return;
    onDragEnd({ lat: latLng.lat(), lon: latLng.lng() });
  }

  return (
    <AdvancedMarker position={position} draggable onDragEnd={handleDragEnd}>
      <div
        style={{ background: color }}
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white"
      >
        {label}
      </div>
    </AdvancedMarker>
  );
}

interface MapPickerProps {
  pickupCoords?: { lat: number; lon: number };
  dropoffCoords?: { lat: number; lon: number };
  onPickupChange: (coords: { lat: number; lon: number }) => void;
  onDropoffChange: (coords: { lat: number; lon: number }) => void;
}

const LONDON_CENTER = { lat: 51.5074, lng: -0.1278 };

export default function MapPicker({
  pickupCoords,
  dropoffCoords,
  onPickupChange,
  onDropoffChange,
}: MapPickerProps) {
  const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!API_KEY) return null;

  const pickupPos = pickupCoords
    ? { lat: pickupCoords.lat, lng: pickupCoords.lon }
    : null;
  const dropoffPos = dropoffCoords
    ? { lat: dropoffCoords.lat, lng: dropoffCoords.lon }
    : null;

  const center = pickupPos ?? dropoffPos ?? LONDON_CENTER;

  return (
    <div className="w-full h-56 rounded-xl overflow-hidden border border-gray-200">
      <Map
        defaultCenter={center}
        defaultZoom={11}
        mapId="taxi-map-picker"
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
      >
        {pickupPos && (
          <DraggableMarker
            position={pickupPos}
            label="P"
            color="#22c55e"
            onDragEnd={onPickupChange}
          />
        )}
        {dropoffPos && (
          <DraggableMarker
            position={dropoffPos}
            label="D"
            color="#ef4444"
            onDragEnd={onDropoffChange}
          />
        )}
      </Map>
    </div>
  );
}
