export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-4"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card space-y-3 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
        </div>
        <div className="skeleton h-6 w-20 rounded-[4px]" />
      </div>
      <div className="skeleton h-3 w-1/3" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <div className="skeleton h-10 w-full rounded" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full rounded" />
      ))}
    </div>
  );
}

/* ─── Content-shaped skeletons. Each mirrors the actual layout it replaces
   so the perceived loading shape matches the eventual content. ────────── */

/** Mirrors `.vehicle-row`: 44px glyph slot, name + meta block, price stack,
   and the radio tick on the right. Three of these match the real picker. */
export function VehicleRowSkeleton() {
  return (
    <div className="vehicle-row" aria-hidden="true">
      <span className="vehicle-row-glyph">
        <span className="skeleton h-8 w-10" />
      </span>
      <div className="vehicle-row-body space-y-2">
        <div className="skeleton h-[18px] w-24" />
        <div className="skeleton h-[11px] w-32" />
      </div>
      <div className="vehicle-row-price space-y-2">
        <div className="skeleton h-[20px] w-16" />
        <div className="skeleton h-[11px] w-10" />
      </div>
      <span className="vehicle-row-tick" />
    </div>
  );
}

/** Mirrors a customer booking card from BookingHistory: pickup + dropoff
   address rows, mono date, status pill on the right, and the price metric. */
export function BookingCardSkeleton() {
  return (
    <div className="page-card p-5" aria-hidden="true">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-2">
            <div className="skeleton h-4 w-4 rounded-[4px]" />
            <div className="skeleton h-4 w-3/5" />
          </div>
          <div className="flex items-start gap-2">
            <div className="skeleton h-4 w-4 rounded-[4px]" />
            <div className="skeleton h-3 w-2/5" />
          </div>
          <div className="skeleton h-3 w-32" />
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="skeleton h-7 w-24 rounded-[4px]" />
          <div className="skeleton h-6 w-16" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors the entire CustomerRideDetail panel layout: topbar, hero with
   route block, driver row, horizontal timeline, 2-col details grid, total
   bar, and the action row. */
export function RideDetailSkeleton() {
  return (
    <div className="ride-detail" aria-hidden="true">
      {/* Topbar */}
      <div className="ride-detail-topbar">
        <div className="skeleton h-4 w-20" />
        <div className="flex items-center gap-2">
          <div className="skeleton h-7 w-24 rounded-[4px]" />
        </div>
      </div>

      {/* Hero */}
      <div className="ride-detail-hero">
        <div className="skeleton h-3 w-20" />
        <div className="ride-detail-route mt-1">
          <div className="ride-detail-route-row">
            <span className="ride-detail-route-marker is-pickup" />
            <div className="skeleton h-[22px] w-3/4" />
          </div>
          <div className="ride-detail-route-spine" />
          <div className="ride-detail-route-row">
            <span className="ride-detail-route-marker is-dropoff" />
            <div className="skeleton h-[22px] w-2/3" />
          </div>
        </div>
        <div className="skeleton h-3 w-40 mt-1" />
      </div>

      {/* Driver */}
      <section>
        <div className="skeleton h-3 w-16 mb-2" />
        <div className="ride-detail-driver">
          <span className="ride-detail-driver-chip">
            <div className="skeleton h-5 w-5 rounded-full" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-3 w-40" />
          </div>
          <div className="skeleton h-11 w-11 rounded-[4px]" />
        </div>
      </section>


      {/* Details */}
      <section>
        <div className="skeleton h-3 w-16 mb-2" />
        <div className="ride-detail-grid">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="ride-detail-grid-cell space-y-1.5">
              <div className="skeleton h-2.5 w-14" />
              <div className="skeleton h-4 w-20" />
            </div>
          ))}
        </div>
      </section>

      {/* Total */}
      <div className="ride-detail-total">
        <div className="skeleton h-3 w-12" />
        <div className="skeleton h-6 w-20" />
      </div>

      {/* Actions */}
      <div className="ride-detail-actions">
        <div className="flex gap-2">
          <div className="skeleton h-[44px] flex-1 rounded-[4px]" />
          <div className="skeleton h-[44px] flex-1 rounded-[4px]" />
        </div>
      </div>
    </div>
  );
}
