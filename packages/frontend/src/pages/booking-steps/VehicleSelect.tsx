import { useEffect, useMemo, useState } from "react";
import type { BookingData } from "../BookingFlow";
import { getQuoteAll } from "../../api/pricing";
import { listVehicles } from "../../api/vehicles";
import { formatPrice } from "../../lib/format";
import { ApiError } from "../../api/client";
import { VehicleRowSkeleton } from "../../components/Skeleton";
import type { Vehicle, VehicleClass, PricingQuoteMulti } from "shared/types";

interface Props {
  data: Partial<BookingData>;
  onNext: (fields: Partial<BookingData>) => void;
  onBack: () => void;
}

const ORDER: VehicleClass[] = ["regular", "comfort", "max"];

function VehicleGlyph({ klass }: { klass: VehicleClass }) {
  // Side-profile silhouettes that read distinct: a hatchback (regular), a
  // long-wheelbase sedan (comfort), a tall MPV/van (max). Same icon family
  // (1.5 stroke, currentColor, no fill) so they sit alongside the rest of
  // the system iconography.
  const common = {
    width: 32,
    height: 32,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (klass === "regular") {
    // Hatchback: short, sloped roofline, two wheels close together.
    return (
      <svg {...common}>
        <path d="M4 15 L4 13 L7 8 L14 8 L18 11 L20 11 L20 15" />
        <path d="M3 15 L21 15" />
        <circle cx="8" cy="16.5" r="1.6" />
        <circle cx="16" cy="16.5" r="1.6" />
      </svg>
    );
  }

  if (klass === "comfort") {
    // Sedan: longer body, three-box profile (hood + cabin + boot).
    return (
      <svg {...common}>
        <path d="M2 16 L2 13.5 L5 13.5 L7 9 L16 9 L18 13.5 L22 13.5 L22 16" />
        <path d="M7 9 L7 13.5 M16 9 L16 13.5 M11.5 9 L11.5 13.5" />
        <path d="M2 16 L22 16" />
        <circle cx="6" cy="17.5" r="1.6" />
        <circle cx="18" cy="17.5" r="1.6" />
      </svg>
    );
  }

  // Max: MPV / people carrier. Tall, boxy, one-box silhouette.
  return (
    <svg {...common}>
      <path d="M3 17 L3 8 Q3 6.5 4.5 6.5 L17 6.5 L21 10 L21 17" />
      <path d="M3 17 L21 17" />
      <path d="M3 11 L19 11" />
      <path d="M11 6.5 L11 11" />
      <circle cx="7" cy="18.5" r="1.6" />
      <circle cx="17" cy="18.5" r="1.6" />
    </svg>
  );
}

export default function VehicleSelect({ data, onNext, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<PricingQuoteMulti | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<VehicleClass>(
    data.vehicleClass || "regular",
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      getQuoteAll({
        from: data.pickupAddress || "",
        to: data.dropoffAddress || "",
        fromLat: data.pickupLat,
        fromLon: data.pickupLon,
        toLat: data.dropoffLat,
        toLon: data.dropoffLon,
      }),
      listVehicles(),
    ])
      .then(([q, v]) => {
        if (cancelled) return;
        setQuote(q);
        setVehicles(v.vehicles);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load pricing",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data.pickupAddress,
    data.dropoffAddress,
    data.pickupLat,
    data.pickupLon,
    data.dropoffLat,
    data.dropoffLon,
  ]);

  const rows = useMemo(() => {
    if (!quote) return [];
    return ORDER.map((klass) => {
      const q = quote.quotes.find((x) => x.vehicleClass === klass);
      const v = vehicles.find((x) => x.class === klass);
      return { klass, quote: q, vehicle: v };
    }).filter((r) => r.quote);
  }, [quote, vehicles]);

  function handleContinue() {
    if (!quote) return;
    const chosen = quote.quotes.find((q) => q.vehicleClass === selected);
    if (!chosen) return;
    onNext({
      vehicleClass: selected,
      pricePence: chosen.pricePence,
      routeType: quote.routeType,
      routeName: quote.routeName,
      isAirport: quote.isAirport,
      isPickupAirport: !!quote.isPickupAirport,
      isDropoffAirport: !!quote.isDropoffAirport,
      distanceMiles: quote.distanceMiles ?? null,
      baseFarePence: chosen.baseFarePence ?? null,
      ratePerMilePence: chosen.ratePerMilePence ?? null,
      finalPricePence: chosen.pricePence,
      discountPence: 0,
      couponCode: undefined,
    });
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <h2 className="text-[22px] font-bold leading-none tracking-[-0.03em] text-[var(--color-dark)]">
        Pick a class
      </h2>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {ORDER.map((k) => (
            <VehicleRowSkeleton key={k} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="empty-state">
          <p className="caption-copy">No pricing available for this route.</p>
          <button onClick={onBack} className="subtle-link mt-3">
            ← Change locations
          </button>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-3" role="radiogroup" aria-label="Vehicle class">
          {rows.map(({ klass, quote: q, vehicle: v }, i) => {
            const isSelected = selected === klass;
            return (
              <button
                key={klass}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(klass)}
                style={{ animationDelay: `${i * 70}ms` }}
                className={`vehicle-row animate-stagger-in ${isSelected ? "is-selected" : ""}`}
              >
                <span className="vehicle-row-glyph" aria-hidden="true">
                  <VehicleGlyph klass={klass} />
                </span>
                <div className="vehicle-row-body">
                  <div className="vehicle-row-name">{v?.name || klass}</div>
                  <div className="mono-label vehicle-row-meta">
                    {v
                      ? `${v.passengerCapacity} PAX · ${v.baggageCapacity} BAGS`
                      : "—"}
                  </div>
                </div>
                <div className="vehicle-row-price">
                  <div className="vehicle-row-amount tabular-nums">
                    {formatPrice(q!.pricePence)}
                  </div>
                  {quote?.distanceMiles != null &&
                    quote.routeType === "mile" && (
                      <div className="mono-label">
                        {quote.distanceMiles.toFixed(1)} MI
                      </div>
                    )}
                </div>
                <span
                  className="vehicle-row-tick"
                  aria-hidden={!isSelected}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="btn-secondary flex-1">
          <span>Back</span>
        </button>
        <button
          onClick={handleContinue}
          disabled={loading || !!error || rows.length === 0}
          className="btn-primary flex-1"
        >
          <span>Continue</span>
          <span className="btn-icon" aria-hidden="true">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
      </div>
    </div>
  );
}
