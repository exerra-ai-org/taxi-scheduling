import { useEffect, useState } from "react";
import AddressAutocomplete from "../../components/maps/AddressAutocomplete";
import { IconMapPin, IconPlane } from "../../components/icons";
import type { ActiveField } from "./MapBackdrop";
import type { BookingData } from "../BookingFlow";

// Heuristic match for "this address is an airport". Catches obvious cases at
// step 1 so we can offer the flight input early. The pricing quote's
// authoritative isPickup/DropoffAirport flags still drive step 4 as a fallback
// for anything this misses.
const AIRPORT_HINTS = [
  "airport",
  "heathrow",
  "gatwick",
  "stansted",
  "luton",
  "city airport",
  "lcy",
  "lhr",
  "lgw",
  "stn",
  "ltn",
  "manchester airport",
  "edinburgh airport",
  "birmingham airport",
];

function isLikelyAirport(addr: string): boolean {
  if (!addr) return false;
  const lower = addr.toLowerCase();
  return AIRPORT_HINTS.some((k) => lower.includes(k));
}

interface Props {
  data: Partial<BookingData>;
  activeField: ActiveField;
  setActiveField: (f: ActiveField) => void;
  pendingPick: { field: ActiveField; lat: number; lon: number; address: string } | null;
  consumePendingPick: () => void;
  onNext: (fields: Partial<BookingData>) => void;
}

export default function JourneyPanel({
  data,
  activeField,
  setActiveField,
  pendingPick,
  consumePendingPick,
  onNext,
}: Props) {
  const [pickup, setPickup] = useState(data.pickupAddress || "");
  const [pickupLat, setPickupLat] = useState<number | undefined>(data.pickupLat);
  const [pickupLon, setPickupLon] = useState<number | undefined>(data.pickupLon);
  const [dropoff, setDropoff] = useState(data.dropoffAddress || "");
  const [dropoffLat, setDropoffLat] = useState<number | undefined>(
    data.dropoffLat,
  );
  const [dropoffLon, setDropoffLon] = useState<number | undefined>(
    data.dropoffLon,
  );
  const [date, setDate] = useState(data.date || "");
  const [time, setTime] = useState(data.time || "");
  const [pickupFlight, setPickupFlight] = useState(
    data.pickupFlightNumber || "",
  );
  const [dropoffFlight, setDropoffFlight] = useState(
    data.dropoffFlightNumber || "",
  );

  const pickupIsAirport = isLikelyAirport(pickup);
  const dropoffIsAirport = isLikelyAirport(dropoff);

  // Apply pending map clicks (parent handles the click + reverse-geocode)
  useEffect(() => {
    if (!pendingPick) return;
    if (pendingPick.field === "pickup") {
      setPickup(pendingPick.address);
      setPickupLat(pendingPick.lat);
      setPickupLon(pendingPick.lon);
      setActiveField("dropoff");
    } else if (pendingPick.field === "dropoff") {
      setDropoff(pendingPick.address);
      setDropoffLat(pendingPick.lat);
      setDropoffLon(pendingPick.lon);
      setActiveField(null);
    }
    consumePendingPick();
  }, [pendingPick, consumePendingPick, setActiveField]);

  function submit(e: React.FormEvent) {
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
      pickupFlightNumber: pickupIsAirport ? pickupFlight || undefined : undefined,
      dropoffFlightNumber: dropoffIsAirport
        ? dropoffFlight || undefined
        : undefined,
    });
  }

  function normaliseFlight(v: string) {
    return v.toUpperCase().replace(/\s+/g, "").slice(0, 10);
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <p className="section-label">New Booking</p>
        <h1 className="mt-3 text-[32px] font-bold leading-none tracking-[-0.04em] text-[var(--color-dark)]">
          Book your ride
        </h1>
        <p className="caption-copy mt-2">
          Type an address or tap the pin icon to drop on the map.
        </p>
      </div>

      <div>
        <label className="field-label mb-2 block">/ Pickup</label>
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
            className="ds-input w-full pr-12"
          />
          <button
            type="button"
            onClick={() =>
              setActiveField(activeField === "pickup" ? null : "pickup")
            }
            title="Pick on map"
            className={`icon-chip absolute right-2 top-1/2 -translate-y-1/2 ${activeField === "pickup" ? "icon-chip-active" : ""}`}
            aria-pressed={activeField === "pickup"}
          >
            <IconMapPin className="h-4 w-4" />
          </button>
        </div>
        {pickupIsAirport && (
          <div className="journey-flight-slot animate-slide-up">
            <label className="field-label mb-2 mt-3 flex items-center gap-1.5">
              <IconPlane className="h-3 w-3" />
              <span>/ Arriving flight (optional)</span>
            </label>
            <input
              type="text"
              value={pickupFlight}
              onChange={(e) => setPickupFlight(normaliseFlight(e.target.value))}
              placeholder="BA245"
              maxLength={10}
              autoCapitalize="characters"
              className="ds-input"
            />
          </div>
        )}
      </div>

      <div>
        <label className="field-label mb-2 block">/ Drop-off</label>
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
            className="ds-input w-full pr-12"
          />
          <button
            type="button"
            onClick={() =>
              setActiveField(activeField === "dropoff" ? null : "dropoff")
            }
            title="Pick on map"
            className={`icon-chip absolute right-2 top-1/2 -translate-y-1/2 ${activeField === "dropoff" ? "icon-chip-active" : ""}`}
            aria-pressed={activeField === "dropoff"}
          >
            <IconMapPin className="h-4 w-4" />
          </button>
        </div>
        {dropoffIsAirport && (
          <div className="journey-flight-slot animate-slide-up">
            <label className="field-label mb-2 mt-3 flex items-center gap-1.5">
              <IconPlane className="h-3 w-3" />
              <span>/ Departing flight (optional)</span>
            </label>
            <input
              type="text"
              value={dropoffFlight}
              onChange={(e) => setDropoffFlight(normaliseFlight(e.target.value))}
              placeholder="BA245"
              maxLength={10}
              autoCapitalize="characters"
              className="ds-input"
            />
          </div>
        )}
      </div>

      {activeField && (
        <div className="alert alert-info flex items-center gap-2 animate-fade-in">
          <IconMapPin className="h-4 w-4 shrink-0" />
          Click the map to set your{" "}
          {activeField === "pickup" ? "pickup" : "drop-off"}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label mb-2 block">/ Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            min={today}
            className="ds-input"
          />
        </div>
        <div>
          <label className="field-label mb-2 block">/ Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="ds-input"
          />
        </div>
      </div>

      <button type="submit" className="btn-green w-full">
        <span>Continue</span>
        <span className="btn-icon" aria-hidden="true">
          <span className="btn-icon-glyph">↗</span>
        </span>
      </button>
    </form>
  );
}
