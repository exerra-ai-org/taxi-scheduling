import type { BookingData } from "../BookingFlow";
import { formatPrice } from "../../lib/format";
import { IconMapPin } from "../../components/icons";

interface Props {
  data: Partial<BookingData>;
  onNext: () => void;
  onBack: () => void;
}

export default function PriceDisplay({ data, onNext, onBack }: Props) {
  if (data.pricePence == null) {
    return (
      <div className="space-y-4">
        <div className="alert alert-error" role="alert">
          No price selected. Step back to choose a vehicle.
        </div>
        <button onClick={onBack} className="subtle-link">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="page-card text-center">
        <div className="metric-value text-[48px] leading-none">
          {formatPrice(data.pricePence)}
        </div>
        {data.routeName && (
          <div className="caption-copy mt-2">{data.routeName}</div>
        )}
        <div className="mono-label mt-2 justify-center flex">
          {data.routeType === "fixed" ? "FIXED ROUTE" : "DISTANCE-BASED"} ·{" "}
          {(data.vehicleClass || "regular").toUpperCase()}
        </div>
        {data.routeType === "mile" && data.distanceMiles != null && (
          <div className="caption-copy mt-3">
            {data.distanceMiles.toFixed(1)} mi @{" "}
            {formatPrice(data.ratePerMilePence ?? 0)}/mi + base{" "}
            {formatPrice(data.baseFarePence ?? 0)}
          </div>
        )}
        {data.isAirport && (
          <div className="mt-4">
            <span className="ds-tag tag-airport">AIRPORT TRANSFER</span>
          </div>
        )}
      </div>

      <div className="page-card-muted space-y-3 p-4">
        <div className="flex items-start gap-2">
          <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-forest)]" />
          <span className="body-copy">{data.pickupAddress}</span>
        </div>
        <div className="flex items-start gap-2">
          <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-dark)]" />
          <span className="body-copy">{data.dropoffAddress}</span>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="btn-secondary flex-1">
          <span>Back</span>
        </button>
        <button onClick={onNext} className="btn-primary flex-1">
          <span>Continue</span>
          <span className="btn-icon" aria-hidden="true">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
      </div>
    </div>
  );
}
