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
      <h2 className="text-xl font-semibold">Where are you going?</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pickup Location
        </label>
        <AddressAutocomplete
          value={pickup}
          onChange={(address, coords) => {
            setPickup(address);
            setPickupLat(coords?.lat);
            setPickupLon(coords?.lon);
          }}
          required
          placeholder="e.g. Heathrow Airport"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Drop-off Location
        </label>
        <AddressAutocomplete
          value={dropoff}
          onChange={(address, coords) => {
            setDropoff(address);
            setDropoffLat(coords?.lat);
            setDropoffLon(coords?.lon);
          }}
          required
          placeholder="e.g. Central London"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            min={today}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Time
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
      >
        Get Quote
      </button>
    </form>
  );
}
