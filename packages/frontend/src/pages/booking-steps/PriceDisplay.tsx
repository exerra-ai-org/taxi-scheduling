import { useEffect, useState } from "react";
import type { BookingData } from "../BookingFlow";
import { getQuote } from "../../api/bookings";
import { formatPrice } from "../../lib/format";

interface Props {
  data: Partial<BookingData>;
  onNext: (fields: Partial<BookingData>) => void;
  onBack: () => void;
}

export default function PriceDisplay({ data, onNext, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<{
    pricePence: number;
    routeType: "fixed" | "zone";
    routeName: string | null;
    isAirport: boolean;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    getQuote(data.pickupAddress || "", data.dropoffAddress || "")
      .then((q) => setQuote(q))
      .catch((err) => setError(err.message || "Failed to get price"))
      .finally(() => setLoading(false));
  }, [data.pickupAddress, data.dropoffAddress]);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Getting your quote...
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded">
          {error || "No pricing available for this route"}
        </div>
        <button
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Change locations
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Your Quote</h2>

      <div className="bg-white border rounded-lg p-6 text-center">
        <div className="text-3xl font-bold text-blue-700">
          {formatPrice(quote.pricePence)}
        </div>
        {quote.routeName && (
          <div className="text-sm text-gray-500 mt-1">{quote.routeName}</div>
        )}
        <div className="text-xs text-gray-400 mt-1">
          {quote.routeType === "fixed" ? "Fixed route" : "Zone-based"} pricing
        </div>
        {quote.isAirport && (
          <span className="inline-block mt-2 bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
            AIRPORT
          </span>
        )}
      </div>

      <div className="text-sm text-gray-500">
        {data.pickupAddress} → {data.dropoffAddress}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() =>
            onNext({
              pricePence: quote.pricePence,
              routeType: quote.routeType,
              routeName: quote.routeName,
              isAirport: quote.isAirport,
              finalPricePence: quote.pricePence,
            })
          }
          className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
