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
        <div className="alert alert-error">
          {error || "No pricing available for this route"}
        </div>
        <button onClick={onBack} className="subtle-link">
          &larr; Change locations
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="section-label">Step 02</p>
        <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
          Your quote
        </h2>
      </div>

      <div className="glass-card p-6 text-center">
        <div className="metric-value text-[56px]">
          {formatPrice(quote.pricePence)}
        </div>
        {quote.routeName && (
          <div className="caption-copy mt-1">{quote.routeName}</div>
        )}
        <div className="mono-label mt-2">
          {quote.routeType === "fixed" ? "Fixed route" : "Zone-based"} pricing
        </div>
        {quote.isAirport && (
          <span className="ds-tag tag-airport mt-3 inline-flex">AIRPORT</span>
        )}
      </div>

      {/* Route map when coords available */}
      {hasRouteCoords && (
        <RouteMap
          pickup={{ lat: data.pickupLat!, lon: data.pickupLon! }}
          dropoff={{ lat: data.dropoffLat!, lon: data.dropoffLon! }}
        />
      )}

      <div className="page-card-muted space-y-3 p-4 text-sm">
        <div className="flex items-start gap-2">
          <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-forest)]" />
          <span className="body-copy">{data.pickupAddress}</span>
        </div>
        <div className="flex items-start gap-2">
          <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-dark)]" />
          <span className="body-copy">{data.dropoffAddress}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary w-full flex-1">
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
          className="btn-primary w-full flex-1"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
