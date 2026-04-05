import { useState } from "react";
import type { BookingData } from "../BookingFlow";
import AddressAutocomplete from "../../components/maps/AddressAutocomplete";
import MapPicker from "../../components/maps/MapPicker";

interface Props {
  data: Partial<BookingData>;
  onNext: (fields: Partial<BookingData>) => void;
}

export default function JourneyInput({ data, onNext }: Props) {
  const [pickup, setPickup] = useState(data.pickupAddress || "");
  const [pickupLat, setPickupLat] = useState<number | undefined>(
    data.pickupLat ?? undefined,
  );
  const [pickupLon, setPickupLon] = useState<number | undefined>(
    data.pickupLon ?? undefined,
  );
  const [dropoff, setDropoff] = useState(data.dropoffAddress || "");
  const [dropoffLat, setDropoffLat] = useState<number | undefined>(
    data.dropoffLat ?? undefined,
  );
  const [dropoffLon, setDropoffLon] = useState<number | undefined>(
    data.dropoffLon ?? undefined,
  );
  const [date, setDate] = useState(data.date || "");
  const [time, setTime] = useState(data.time || "");

  const hasCoords =
    (pickupLat != null && pickupLon != null) ||
    (dropoffLat != null && dropoffLon != null);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="section-label">Step 01</p>
        <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
          Where are you going?
        </h2>
      </div>

      <div>
        <label className="field-label mb-2 block">Pickup Location</label>
        <AddressAutocomplete
          value={pickup}
          onChange={(address, coords) => {
            setPickup(address);
            setPickupLat(coords?.lat);
            setPickupLon(coords?.lon);
          }}
          required
          placeholder="e.g. Heathrow Airport"
          className="input-glass"
        />
      </div>

      <div>
        <label className="field-label mb-2 block">Drop-off Location</label>
        <AddressAutocomplete
          value={dropoff}
          onChange={(address, coords) => {
            setDropoff(address);
            setDropoffLat(coords?.lat);
            setDropoffLon(coords?.lon);
          }}
          required
          placeholder="e.g. Central London"
          className="input-glass"
        />
      </div>

      {/* Map picker when coordinates available */}
      {hasCoords && (
        <MapPicker
          pickupCoords={
            pickupLat != null && pickupLon != null
              ? { lat: pickupLat, lon: pickupLon }
              : undefined
          }
          dropoffCoords={
            dropoffLat != null && dropoffLon != null
              ? { lat: dropoffLat, lon: dropoffLon }
              : undefined
          }
          onPickupChange={(c) => {
            setPickupLat(c.lat);
            setPickupLon(c.lon);
          }}
          onDropoffChange={(c) => {
            setDropoffLat(c.lat);
            setDropoffLon(c.lon);
          }}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
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
    </form>
  );
}
