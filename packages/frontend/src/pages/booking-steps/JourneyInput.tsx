import { useState } from "react";
import type { BookingData } from "../BookingFlow";

interface Props {
  data: Partial<BookingData>;
  onNext: (fields: Partial<BookingData>) => void;
}

export default function JourneyInput({ data, onNext }: Props) {
  const [pickup, setPickup] = useState(data.pickupAddress || "");
  const [dropoff, setDropoff] = useState(data.dropoffAddress || "");
  const [date, setDate] = useState(data.date || "");
  const [time, setTime] = useState(data.time || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onNext({
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      date,
      time,
    });
  }

  // Minimum date is today
  const today = new Date().toISOString().split("T")[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold">Where are you going?</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pickup Location
        </label>
        <input
          type="text"
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          required
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Heathrow Airport"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Drop-off Location
        </label>
        <input
          type="text"
          value={dropoff}
          onChange={(e) => setDropoff(e.target.value)}
          required
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Central London"
        />
      </div>

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
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700"
      >
        Get Quote
      </button>
    </form>
  );
}
