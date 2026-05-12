import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import {
  getAdminSettings,
  updateSettings,
  type Settings,
} from "../../api/settings";

interface FieldDef {
  key: keyof Settings;
  label: string;
  hint: string;
  type: "text" | "tel" | "number" | "toggle";
  inputMode?: "numeric" | "tel";
  group: "contact" | "waiting" | "geofence";
}

const FIELDS: FieldDef[] = [
  // Contact
  {
    key: "adminContactPhone",
    label: "Admin contact number",
    hint: "Number customers reach via the in-app 'Contact admin' button (tel: link).",
    type: "tel",
    inputMode: "tel",
    group: "contact",
  },
  {
    key: "emergencyNumber",
    label: "Emergency services number",
    hint: "Dialled when a customer triggers SOS. Default is 999 (UK).",
    type: "tel",
    inputMode: "tel",
    group: "contact",
  },
  // Waiting / no-show
  {
    key: "noShowAfterMinutes",
    label: "No-show grace (minutes)",
    hint: "Minutes after driver arrival before a driver may mark the customer as no-show.",
    type: "number",
    inputMode: "numeric",
    group: "waiting",
  },
  {
    key: "waitingFreeMinutes",
    label: "Free waiting window (minutes)",
    hint: "Minutes after driver arrival that are free of charge.",
    type: "number",
    inputMode: "numeric",
    group: "waiting",
  },
  {
    key: "waitingRatePence",
    label: "Waiting rate (pence per block)",
    hint: "Charge per increment once the free window is exhausted.",
    type: "number",
    inputMode: "numeric",
    group: "waiting",
  },
  {
    key: "waitingIncrementMinutes",
    label: "Waiting increment (minutes)",
    hint: "Block size used when accruing the waiting fee.",
    type: "number",
    inputMode: "numeric",
    group: "waiting",
  },
  // Geofence
  {
    key: "geofenceAutoArrive",
    label: "Auto-mark arrived via geofence",
    hint: "When ON: a driver sitting inside the pickup radius for the dwell window auto-flips the ride to arrived. OFF preserves the manual button-press flow.",
    type: "toggle",
    group: "geofence",
  },
  {
    key: "geofencePickupRadiusM",
    label: "Pickup radius (metres)",
    hint: "How close the driver must be to the pickup point before the dwell timer starts. 75m is a sensible kerbside default.",
    type: "number",
    inputMode: "numeric",
    group: "geofence",
  },
  {
    key: "geofencePickupDwellMs",
    label: "Pickup dwell (ms)",
    hint: "How long the driver must remain inside the radius before auto-arrive fires. 20000 ms = 20 seconds.",
    type: "number",
    inputMode: "numeric",
    group: "geofence",
  },
];

const GROUP_LABELS: Record<FieldDef["group"], string> = {
  contact: "Contact numbers",
  waiting: "Waiting & no-show",
  geofence: "Geofence (auto-arrive)",
};

export default function AdminSettings() {
  const [values, setValues] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setValues(await getAdminSettings());
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not load settings",
        );
      }
    })();
  }, []);

  function set(key: keyof Settings, v: string) {
    setValues((prev) => (prev ? { ...prev, [key]: v } : prev));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!values) return;
    setBusy(true);
    setError("");
    try {
      const next = await updateSettings(values);
      setValues(next);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!values) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-[var(--color-muted)]">
        {error || "Loading settings..."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="section-label">/ Admin</p>
      <h1 className="mb-2 text-[30px] font-bold leading-tight tracking-[-0.04em] text-[var(--color-dark)]">
        Settings
      </h1>
      <p className="caption-copy mb-8">
        Operational dials that the customer and driver apps read at runtime.
      </p>

      {error && (
        <div className="alert alert-error mb-5" role="alert">
          {error}
        </div>
      )}
      {savedAt && (
        <div className="alert alert-success mb-5" role="status">
          Saved at {savedAt.toLocaleTimeString()}
        </div>
      )}

      <form onSubmit={save} className="space-y-10">
        {(Object.keys(GROUP_LABELS) as FieldDef["group"][]).map((group) => (
          <section key={group} className="space-y-6">
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--color-dark)]">
              {GROUP_LABELS[group]}
            </h2>
            {FIELDS.filter((f) => f.group === group).map((field) => (
              <div key={field.key}>
                <label className="field-label mb-2 block">
                  / {field.label}
                </label>
                {field.type === "toggle" ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={values[field.key] === "true"}
                    onClick={() =>
                      set(
                        field.key,
                        values[field.key] === "true" ? "false" : "true",
                      )
                    }
                    className={`inline-flex h-7 w-12 items-center rounded-full border transition-colors ${
                      values[field.key] === "true"
                        ? "border-[var(--color-green)] bg-[var(--color-green)]"
                        : "border-neutral-700 bg-neutral-800"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        values[field.key] === "true"
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                    <span className="sr-only">
                      {values[field.key] === "true" ? "On" : "Off"}
                    </span>
                  </button>
                ) : (
                  <input
                    type={field.type}
                    inputMode={field.inputMode}
                    value={values[field.key]}
                    onChange={(e) => set(field.key, e.target.value)}
                    className="ds-input"
                  />
                )}
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {field.hint}
                </p>
              </div>
            ))}
          </section>
        ))}

        <button type="submit" disabled={busy} className="btn-primary">
          <span>{busy ? "Saving..." : "Save settings"}</span>
          <span className="btn-icon" aria-hidden="true">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
      </form>
    </div>
  );
}
