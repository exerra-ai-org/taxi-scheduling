import { useEffect, useState } from "react";
import type { BookingData } from "../BookingFlow";
import { getQuote } from "../../api/bookings";
import { formatPrice } from "../../lib/format";
import { Skeleton } from "../../components/Skeleton";
import { IconMapPin } from "../../components/icons";
import RouteMap from "../../components/maps/RouteMap";

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
    getQuote(data.pickupAddress || "", data.dropoffAddress || "", {
      fromLat: data.pickupLat,
      fromLon: data.pickupLon,
      toLat: data.dropoffLat,
      toLon: data.dropoffLon,
    })
      .then((q) => setQuote(q))
      .catch((err) => setError(err.message || "Failed to get price"))
      .finally(() => setLoading(false));
  }, [
    data.pickupAddress,
    data.dropoffAddress,
    data.pickupLat,
    data.pickupLon,
    data.dropoffLat,
    data.dropoffLon,
  ]);

  const hasRouteCoords =
    data.pickupLat != null &&
    data.pickupLon != null &&
    data.dropoffLat != null &&
    data.dropoffLon != null;

  if (loading) {
    return (
      <div className="space-y-4 py-8">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-1/2 mx-auto" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-100">
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

      <div className="bg-white border rounded-xl p-6 text-center">
        <div className="text-4xl font-bold text-blue-700">
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

      {/* Route map when coords available */}
      {hasRouteCoords && (
        <RouteMap
          pickup={{ lat: data.pickupLat!, lon: data.pickupLon! }}
          dropoff={{ lat: data.dropoffLat!, lon: data.dropoffLon! }}
        />
      )}

      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
        <div className="flex items-start gap-2">
          <IconMapPin className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
          <span className="text-gray-700">{data.pickupAddress}</span>
        </div>
        <div className="flex items-start gap-2">
          <IconMapPin className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span className="text-gray-700">{data.dropoffAddress}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors"
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
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
