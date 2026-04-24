import { useEffect, useState } from "react";
import type { Vehicle, VehicleClass, PricingQuoteMulti } from "shared/types";
import type { BookingData } from "../BookingFlow";
import { listVehicles } from "../../api/vehicles";
import { getQuoteAllClasses } from "../../api/bookings";
import { formatPrice } from "../../lib/format";
import { Skeleton } from "../../components/Skeleton";

interface Props {
  data: Partial<BookingData>;
  onNext: (fields: Partial<BookingData>) => void;
  onBack: () => void;
}

const CLASS_ORDER: VehicleClass[] = ["regular", "comfort", "max"];

export default function VehicleSelect({ data, onNext, onBack }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [quotes, setQuotes] = useState<PricingQuoteMulti | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<VehicleClass>(
    data.vehicleClass || "regular",
  );

  useEffect(() => {
    setLoading(true);
    setError("");

    Promise.all([
      listVehicles(),
      getQuoteAllClasses(data.pickupAddress || "", data.dropoffAddress || "", {
        fromLat: data.pickupLat,
        fromLon: data.pickupLon,
        toLat: data.dropoffLat,
        toLon: data.dropoffLon,
      }),
    ])
      .then(([vRes, qRes]) => {
        setVehicles(vRes.vehicles);
        setQuotes(qRes);
      })
      .catch((err) => setError(err.message || "Failed to load vehicle options"))
      .finally(() => setLoading(false));
  }, [
    data.pickupAddress,
    data.dropoffAddress,
    data.pickupLat,
    data.pickupLon,
    data.dropoffLat,
    data.dropoffLon,
  ]);

  if (loading) {
    return (
      <div className="space-y-4 py-8">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !quotes) {
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

  const sorted = CLASS_ORDER.map((cls) =>
    vehicles.find((v) => v.class === cls),
  ).filter(Boolean) as Vehicle[];

  function getPrice(cls: VehicleClass): number | null {
    if (!quotes) return null;
    const entry = quotes.quotes.find((e) => e.vehicleClass === cls);
    return entry?.pricePence ?? null;
  }

  function handleContinue() {
    const price = getPrice(selected);
    const quote = quotes?.quotes.find((e) => e.vehicleClass === selected);
    onNext({
      vehicleClass: selected,
      pricePence: price ?? 0,
      routeType: quotes?.routeType ?? "mile",
      routeName: quotes?.routeName ?? null,
      isAirport: quotes?.isAirport ?? false,
      isPickupAirport: quotes?.isPickupAirport ?? false,
      isDropoffAirport: quotes?.isDropoffAirport ?? false,
      finalPricePence: price ?? 0,
      distanceMiles: quotes?.distanceMiles ?? undefined,
      baseFarePence: quote?.baseFarePence,
      ratePerMilePence: quote?.ratePerMilePence,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="section-label">Step 02</p>
        <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
          Choose your vehicle
        </h2>
        <p className="caption-copy mt-2">
          Select the vehicle class that suits your journey
        </p>
      </div>

      <div className="space-y-3">
        {sorted.map((v) => {
          const price = getPrice(v.class);
          const isSelected = selected === v.class;
          return (
            <button
              key={v.class}
              type="button"
              onClick={() => setSelected(v.class)}
              className={`glass-card w-full p-4 text-left transition-all ${
                isSelected
                  ? "ring-2 ring-[var(--color-green)] border-[var(--color-green)]"
                  : "hover:border-[var(--color-dark)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[var(--color-dark)]">
                      {v.name}
                    </h3>
                    {isSelected && (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-green)] text-xs font-bold text-white">
                        ✓
                      </span>
                    )}
                  </div>
                  {v.description && (
                    <p className="caption-copy text-sm">{v.description}</p>
                  )}
                  <div className="flex items-center gap-4 pt-1">
                    <span className="mono-label flex items-center gap-1">
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      {v.passengerCapacity} passengers
                    </span>
                    <span className="mono-label flex items-center gap-1">
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="2" y="7" width="20" height="14" rx="2" />
                        <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
                      </svg>
                      {v.baggageCapacity} bags
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0 pl-4">
                  {price != null ? (
                    <div className="text-2xl font-bold text-[var(--color-dark)]">
                      {formatPrice(price)}
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--color-muted)]">--</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {quotes.distanceMiles != null && (
        <div className="mono-label text-center">
          {quotes.distanceMiles.toFixed(1)} miles ·{" "}
          {quotes.routeType === "fixed" ? "Fixed route" : "Mile-based"} pricing
        </div>
      )}

      {quotes.isAirport && (
        <div className="text-center">
          <span className="ds-tag tag-airport">AIRPORT TRANSFER</span>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary w-full flex-1">
          Back
        </button>
        <button onClick={handleContinue} className="btn-primary w-full flex-1">
          Continue
        </button>
      </div>
    </div>
  );
}
