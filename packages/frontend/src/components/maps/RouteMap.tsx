import { useEffect, useRef } from "react";
import { Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

interface Coords {
  lat: number;
  lon: number;
}

interface RouteOverlayProps {
  pickup: Coords;
  dropoff: Coords;
}

function RouteOverlay({ pickup, dropoff }: RouteOverlayProps) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  useEffect(() => {
    if (!routesLib || !map) return;

    const service = new routesLib.DirectionsService();
    if (!rendererRef.current) {
      rendererRef.current = new routesLib.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: { strokeColor: "#2563eb", strokeWeight: 4 },
      });
    }
    rendererRef.current.setMap(map);

    service.route(
      {
        origin: { lat: pickup.lat, lng: pickup.lon },
        destination: { lat: dropoff.lat, lng: dropoff.lon },
        travelMode: routesLib.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result) {
          rendererRef.current!.setDirections(result);
        }
      },
    );

    return () => {
      rendererRef.current?.setMap(null);
    };
  }, [map, routesLib, pickup.lat, pickup.lon, dropoff.lat, dropoff.lon]);

  return null;
}

interface RouteMapProps {
  pickup: Coords;
  dropoff: Coords;
}

export default function RouteMap({ pickup, dropoff }: RouteMapProps) {
  const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!API_KEY) return null;

  const center = {
    lat: (pickup.lat + dropoff.lat) / 2,
    lng: (pickup.lon + dropoff.lon) / 2,
  };

  return (
    <div className="w-full h-48 rounded-xl overflow-hidden border border-gray-200">
      <Map
        defaultCenter={center}
        defaultZoom={10}
        mapId="taxi-route-map"
        gestureHandling="none"
        disableDefaultUI
      >
        <RouteOverlay pickup={pickup} dropoff={dropoff} />
      </Map>
    </div>
  );
}
