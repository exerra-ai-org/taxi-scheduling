import { useState, useEffect, useCallback, useRef } from "react";
import { useBottomSheet } from "../hooks/useBottomSheet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { BookingData } from "./BookingFlow";
import AddressAutocomplete from "../components/maps/AddressAutocomplete";
import { IconMapPin } from "../components/icons";
import { config } from "../config";

const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

const UK_CENTER: L.LatLngExpression = [54.5, -2.5];
const UK_ZOOM = 6;

interface Props {
  data: Partial<BookingData>;
  onNext: (fields: Partial<BookingData>) => void;
}

interface Coords {
  lat: number;
  lon: number;
}

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

function MapController({
  pickupCoords,
  dropoffCoords,
  activeField,
  onMapClick,
}: {
  pickupCoords: Coords | null;
  dropoffCoords: Coords | null;
  activeField: "pickup" | "dropoff" | null;
  onMapClick: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  // Auto-fit bounds when both markers placed
  useEffect(() => {
    if (!pickupCoords || !dropoffCoords) return;
    const bounds = L.latLngBounds(
      [pickupCoords.lat, pickupCoords.lon],
      [dropoffCoords.lat, dropoffCoords.lon],
    );
    map.fitBounds(bounds, {
      padding: [60, 60],
      paddingBottomRight: [40, 200],
    });
  }, [
    map,
    pickupCoords?.lat,
    pickupCoords?.lon,
    dropoffCoords?.lat,
    dropoffCoords?.lon,
  ]);

  // Cursor style for active pick mode
  useEffect(() => {
    if (activeField) {
      map.getContainer().style.cursor = "crosshair";
    } else {
      map.getContainer().style.cursor = "";
    }
    return () => {
      map.getContainer().style.cursor = "";
    };
  }, [map, activeField]);

  // Map click via react-leaflet hook
  useMapEvents({
    click(e) {
      if (activeField) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
}

export default function LandingMap({ data, onNext }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const { handleRef, isOpen: sheetOpen, setIsOpen: setSheetOpen } =
    useBottomSheet(formRef);
  const [pickup, setPickup] = useState(data.pickupAddress || "");
  const [pickupLat, setPickupLat] = useState<number | undefined>(
    data.pickupLat,
  );
  const [pickupLon, setPickupLon] = useState<number | undefined>(
    data.pickupLon,
  );
  const [dropoff, setDropoff] = useState(data.dropoffAddress || "");
  const [dropoffLat, setDropoffLat] = useState<number | undefined>(
    data.dropoffLat,
  );
  const [dropoffLon, setDropoffLon] = useState<number | undefined>(
    data.dropoffLon,
  );
  const [date, setDate] = useState(data.date || "");
  const [time, setTime] = useState(data.time || "");
  const [activeField, setActiveField] = useState<"pickup" | "dropoff" | null>(
    null,
  );
  const [route, setRoute] = useState<L.LatLngExpression[]>([]);

  // Fetch route when both coords set
  useEffect(() => {
    if (
      pickupLat == null ||
      pickupLon == null ||
      dropoffLat == null ||
      dropoffLon == null
    ) {
      setRoute([]);
      return;
    }
    const url = `${config.osrmUrl}/route/v1/driving/${pickupLon},${pickupLat};${dropoffLon},${dropoffLat}?overview=full&geometries=geojson`;
    fetch(url)
      .then((r) => r.json())
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
          [pickupLat, pickupLon],
          [dropoffLat, dropoffLon],
        ]);
      });
  }, [pickupLat, pickupLon, dropoffLat, dropoffLon]);

  // Reverse geocode a map click
  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (!activeField) return;

      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      )
        .then((r) => r.json())
        .then((data) => {
          const address =
            data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          if (activeField === "pickup") {
            setPickup(address);
            setPickupLat(lat);
            setPickupLon(lng);
            setActiveField("dropoff");
          } else {
            setDropoff(address);
            setDropoffLat(lat);
            setDropoffLon(lng);
            setActiveField(null);
          }
        })
        .catch(() => {
          const address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          if (activeField === "pickup") {
            setPickup(address);
            setPickupLat(lat);
            setPickupLon(lng);
            setActiveField("dropoff");
          } else {
            setDropoff(address);
            setDropoffLat(lat);
            setDropoffLon(lng);
            setActiveField(null);
          }
        });
    },
    [activeField],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onNext({
      pickupAddress: pickup,
      pickupLat,
      pickupLon,
      dropoffAddress: dropoff,
      dropoffLat,
      dropoffLon,
      date,
      time,
    });
  }

  const today = new Date().toISOString().split("T")[0];
  const pickupCoords =
    pickupLat != null && pickupLon != null
      ? { lat: pickupLat, lon: pickupLon }
      : null;
  const dropoffCoords =
    dropoffLat != null && dropoffLon != null
      ? { lat: dropoffLat, lon: dropoffLon }
      : null;

  return (
    <div className="fixed inset-0 top-[72px]">
      {/* Full-page map */}
      <MapContainer
        center={UK_CENTER}
        zoom={UK_ZOOM}
        className="w-full h-full"
        zoomControl
        scrollWheelZoom
        doubleClickZoom
        dragging
        attributionControl={false}
      >
        <TileLayer url={DARK_TILES} attribution={TILE_ATTR} />
        <MapController
          pickupCoords={pickupCoords}
          dropoffCoords={dropoffCoords}
          activeField={activeField}
          onMapClick={handleMapClick}
        />
        {pickupCoords && (
          <Marker
            position={[pickupCoords.lat, pickupCoords.lon]}
            icon={pickupIcon()}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const ll = e.target.getLatLng();
                setPickupLat(ll.lat);
                setPickupLon(ll.lng);
              },
            }}
          />
        )}
        {dropoffCoords && (
          <Marker
            position={[dropoffCoords.lat, dropoffCoords.lon]}
            icon={dropoffIcon()}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const ll = e.target.getLatLng();
                setDropoffLat(ll.lat);
                setDropoffLon(ll.lng);
              },
            }}
          />
        )}
        {route.length > 0 && (
          <Polyline
            positions={route}
            pathOptions={{ color: "#131313", weight: 4, opacity: 0.8 }}
          />
        )}
      </MapContainer>

      {!pickupCoords && !dropoffCoords && (
        <div className="pointer-events-none absolute left-1/2 top-6 z-[1001] hidden -translate-x-1/2 animate-fade-in rounded-[64px] border border-[var(--color-border)] bg-[rgb(255_255_255_/_0.94)] px-5 py-3 text-sm font-medium text-[var(--color-dark)] shadow-[var(--shadow-card)] md:block">
          Enter your pickup and drop-off locations to get started
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`floating-panel landing-form-panel absolute left-1/2 top-1/2 z-[1001] mx-4 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 pointer-events-auto animate-scale-in${sheetOpen ? " sheet-open" : ""}`}
      >
        <div
          ref={handleRef}
          className="sheet-handle"
          aria-hidden="true"
          onClick={() => setSheetOpen((v) => !v)}
        >
          <div className="sheet-handle-pill" />
        </div>
        <div className="space-y-5 p-6">
        <div>
          <p className="section-label">New Booking</p>
          <h1 className="mt-4 text-[40px] font-bold leading-none tracking-[-0.04em] text-[var(--color-dark)]">
            Book your ride
          </h1>
          <p className="caption-copy mt-2">
            Enter your locations or click on the map
          </p>
        </div>

        <div>
          <label className="field-label mb-2 block">Pickup</label>
          <div className="relative">
            <AddressAutocomplete
              value={pickup}
              onChange={(addr, coords) => {
                setPickup(addr);
                setPickupLat(coords?.lat);
                setPickupLon(coords?.lon);
              }}
              required
              placeholder="e.g. Heathrow Airport"
              className="input-glass w-full pr-12"
            />
            <button
              type="button"
              onClick={() =>
                setActiveField(activeField === "pickup" ? null : "pickup")
              }
              title="Pick on map"
              className={`icon-chip absolute right-2 top-1/2 -translate-y-1/2 ${activeField === "pickup" ? "icon-chip-active" : ""}`}
            >
              <IconMapPin className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
          <label className="field-label mb-2 block">Drop-off</label>
          <div className="relative">
            <AddressAutocomplete
              value={dropoff}
              onChange={(addr, coords) => {
                setDropoff(addr);
                setDropoffLat(coords?.lat);
                setDropoffLon(coords?.lon);
              }}
              required
              placeholder="e.g. Central London"
              className="input-glass w-full pr-12"
            />
            <button
              type="button"
              onClick={() =>
                setActiveField(activeField === "dropoff" ? null : "dropoff")
              }
              title="Pick on map"
              className={`icon-chip absolute right-2 top-1/2 -translate-y-1/2 ${activeField === "dropoff" ? "icon-chip-active" : ""}`}
            >
              <IconMapPin className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeField && (
          <div className="alert alert-info flex items-center gap-2 animate-fade-in">
            <IconMapPin className="w-4 h-4 shrink-0" />
            Click the map to set your{" "}
            {activeField === "pickup" ? "pickup" : "drop-off"}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label mb-2 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              min={today}
              className="input-glass"
            />
          </div>
          <div>
            <label className="field-label mb-2 block">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="input-glass"
            />
          </div>
        </div>

        <button type="submit" className="btn-primary w-full">
          <span>Get Quote</span>
          <span className="btn-icon">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
        </div>
      </form>
    </div>
  );
}
