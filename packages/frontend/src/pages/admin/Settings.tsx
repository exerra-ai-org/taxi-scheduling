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
  type: "text" | "tel" | "number";
  inputMode?: "numeric" | "tel";
}

const FIELDS: FieldDef[] = [
  {
    key: "adminContactPhone",
    label: "Admin contact number",
    hint: "Number customers reach via the in-app 'Contact admin' button (tel: link).",
    type: "tel",
    inputMode: "tel",
  },
  {
    key: "emergencyNumber",
    label: "Emergency services number",
    hint: "Dialled when a customer triggers SOS. Default is 999 (UK).",
    type: "tel",
    inputMode: "tel",
  },
  {
    key: "noShowAfterMinutes",
    label: "No-show grace (minutes)",
    hint: "Minutes after driver arrival before a driver may mark the customer as no-show.",
    type: "number",
    inputMode: "numeric",
  },
  {
    key: "waitingFreeMinutes",
    label: "Free waiting window (minutes)",
    hint: "Minutes after driver arrival that are free of charge.",
    type: "number",
    inputMode: "numeric",
  },
  {
    key: "waitingRatePence",
    label: "Waiting rate (pence per block)",
    hint: "Charge per increment once the free window is exhausted.",
    type: "number",
    inputMode: "numeric",
  },
  {
    key: "waitingIncrementMinutes",
    label: "Waiting increment (minutes)",
    hint: "Block size used when accruing the waiting fee.",
    type: "number",
    inputMode: "numeric",
  },
];

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

      <form onSubmit={save} className="space-y-6">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="field-label mb-2 block">/ {field.label}</label>
            <input
              type={field.type}
              inputMode={field.inputMode}
              value={values[field.key]}
              onChange={(e) => set(field.key, e.target.value)}
              className="ds-input"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {field.hint}
            </p>
          </div>
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
