import type { BookingData } from "../BookingFlow";
import { formatPrice } from "../../lib/format";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { IconMapPin } from "../../components/icons";

interface Props {
  data: Partial<BookingData>;
  status: "loading" | "ready" | "error" | "idle";
  error: string;
  onRetry: () => void;
  onBack: () => void;
  onNext: () => void;
}

export default function PriceDisplay({
  data,
  status,
  error,
  onRetry,
  onBack,
  onNext,
}: Props) {
  if (status === "loading" || status === "idle") {
    return (
      <div className="space-y-4 animate-fade-in">
        <div>
          <p className="section-label">Step 02</p>
          <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
            Getting your quote
          </h2>
          <p className="caption-copy mt-2">
            We&apos;re pricing your trip and preparing the route view.
          </p>
        </div>

        <div className="glass-card space-y-4 p-6 text-center">
          <Skeleton className="mx-auto h-16 w-40" />
          <Skeleton className="mx-auto h-4 w-36" />
          <Skeleton className="mx-auto h-3 w-28" />
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
          <SkeletonText lines={2} />
        </div>

        <button onClick={onBack} className="btn-secondary w-full">
          Change journey
        </button>
      </div>
    );
  }

  if (
    status === "error" ||
    data.pricePence == null ||
    data.routeType == null ||
    data.routeName === undefined ||
    data.isAirport == null
  ) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div>
          <p className="section-label">Step 02</p>
          <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
            Quote unavailable
          </h2>
        </div>
        <div className="alert alert-error">
          {error || "No pricing available for this route"}
        </div>
        <div className="flex gap-3">
          <button onClick={onBack} className="btn-secondary w-full flex-1">
            Change journey
          </button>
          <button onClick={onRetry} className="btn-primary w-full flex-1">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <p className="section-label">Step 02</p>
        <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
          Your quote
        </h2>
      </div>

      <div className="glass-card p-6 text-center">
        <div className="metric-value text-[56px]">
          {formatPrice(data.pricePence)}
        </div>
        {data.routeName && (
          <div className="caption-copy mt-1">{data.routeName}</div>
        )}
        <div className="mono-label mt-2">
          {data.routeType === "fixed" ? "Fixed route" : "Zone-based"} pricing
        </div>
        {data.isAirport && (
          <span className="ds-tag tag-airport mt-3 inline-flex">AIRPORT</span>
        )}
      </div>

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
          Change journey
        </button>
        <button onClick={onNext} className="btn-primary w-full flex-1">
          Continue
        </button>
      </div>
    </div>
  );
}
