import { useEffect, useState } from "react";
import {
  listVehicles,
  listMileRates,
  updateVehicle,
  updateMileRate,
} from "../../api/vehicles";
import { ApiError } from "../../api/client";
import type { Vehicle, MileRate, VehicleClass } from "shared/types";

// Store per-class editable state
interface ClassState {
  // capacity
  pax: string;
  bags: string;
  // pricing (held in £ strings, converted to pence on save)
  baseFare: string;
  ratePerMile: string;
  // ui
  saving: boolean;
  error: string;
  saved: boolean;
}

function poundsToString(pence: number) {
  return (pence / 100).toFixed(2);
}

function poundsToPence(str: string): number | null {
  const n = parseFloat(str);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

function initState(v: Vehicle, r: MileRate | undefined): ClassState {
  return {
    pax: String(v.passengerCapacity),
    bags: String(v.baggageCapacity),
    baseFare: r ? poundsToString(r.baseFarePence) : "",
    ratePerMile: r ? poundsToString(r.ratePerMilePence) : "",
    saving: false,
    error: "",
    saved: false,
  };
}

function VehicleCard({
  vehicle,
  rate,
}: {
  vehicle: Vehicle;
  rate: MileRate | undefined;
}) {
  const [s, setS] = useState<ClassState>(() => initState(vehicle, rate));

  const orig = initState(vehicle, rate);
  const dirty =
    s.pax !== orig.pax ||
    s.bags !== orig.bags ||
    s.baseFare !== orig.baseFare ||
    s.ratePerMile !== orig.ratePerMile;

  function field(key: keyof ClassState, value: string) {
    setS((prev) => ({ ...prev, [key]: value, error: "", saved: false }));
  }

  async function handleSave() {
    const pax = parseInt(s.pax, 10);
    const bags = parseInt(s.bags, 10);
    const baseFarePence = poundsToPence(s.baseFare);
    const ratePerMilePence = poundsToPence(s.ratePerMile);

    if (isNaN(pax) || pax < 1 || pax > 20)
      return setS((p) => ({ ...p, error: "PAX must be 1–20" }));
    if (isNaN(bags) || bags < 0 || bags > 20)
      return setS((p) => ({ ...p, error: "Bags must be 0–20" }));
    if (baseFarePence === null)
      return setS((p) => ({ ...p, error: "Invalid base fare" }));
    if (ratePerMilePence === null)
      return setS((p) => ({ ...p, error: "Invalid per-mile rate" }));

    setS((p) => ({ ...p, saving: true, error: "" }));
    try {
      await Promise.all([
        updateVehicle(vehicle.class, {
          passengerCapacity: pax,
          baggageCapacity: bags,
        }),
        rate
          ? updateMileRate(vehicle.class, { baseFarePence, ratePerMilePence })
          : Promise.resolve(),
      ]);
      setS((p) => ({ ...p, saving: false, saved: true }));
      setTimeout(() => setS((p) => ({ ...p, saved: false })), 2500);
    } catch (err) {
      setS((p) => ({
        ...p,
        saving: false,
        error: err instanceof ApiError ? err.message : "Save failed",
      }));
    }
  }

  return (
    <div className="glass-card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label">{vehicle.name}</p>
          <p className="mono-label text-[var(--color-muted)]">
            {vehicle.class.toUpperCase()}
          </p>
        </div>
        {s.saved && (
          <span className="mono-label text-[var(--color-forest)]">SAVED</span>
        )}
      </div>

      {/* Capacity */}
      <div>
        <p className="field-label mb-3">/ Capacity</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label mb-2 block">Passengers (PAX)</label>
            <input
              type="number"
              min={1}
              max={20}
              value={s.pax}
              onChange={(e) => field("pax", e.target.value)}
              className="ds-input"
            />
          </div>
          <div>
            <label className="field-label mb-2 block">Bags</label>
            <input
              type="number"
              min={0}
              max={20}
              value={s.bags}
              onChange={(e) => field("bags", e.target.value)}
              className="ds-input"
            />
          </div>
        </div>
      </div>

      {/* Pricing */}
      {rate && (
        <div>
          <p className="field-label mb-3">/ Pricing</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label mb-2 block">Base fare (£)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={s.baseFare}
                onChange={(e) => field("baseFare", e.target.value)}
                className="ds-input"
              />
            </div>
            <div>
              <label className="field-label mb-2 block">Per mile (£)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={s.ratePerMile}
                onChange={(e) => field("ratePerMile", e.target.value)}
                className="ds-input"
              />
            </div>
          </div>
        </div>
      )}

      {s.error && <div className="alert alert-error text-sm">{s.error}</div>}

      <button
        onClick={handleSave}
        disabled={s.saving || !dirty}
        className="btn-primary w-full"
      >
        <span>{s.saving ? "Saving…" : "Save changes"}</span>
      </button>
    </div>
  );
}

export default function VehicleManagement() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rates, setRates] = useState<MileRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listVehicles(), listMileRates()])
      .then(([{ vehicles }, { rates }]) => {
        setVehicles(vehicles);
        setRates(rates);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load"),
      )
      .finally(() => setLoading(false));
  }, []);

  function rateFor(cls: VehicleClass) {
    return rates.find((r) => r.vehicleClass === cls);
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <h1 className="page-title">Vehicle types</h1>
      </div>

      {loading && (
        <div className="empty-state">
          <p className="caption-copy">Loading…</p>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && (
        <div className="space-y-4">
          {vehicles.map((v) => (
            <VehicleCard key={v.class} vehicle={v} rate={rateFor(v.class)} />
          ))}
        </div>
      )}
    </div>
  );
}
