import { useEffect, useMemo, useState } from "react";
import type { FixedRoute } from "shared/types";
import {
  listFixedRoutes,
  createFixedRoute,
  updateFixedRoute,
  deleteFixedRoute,
} from "../../api/admin";
import { formatPrice } from "../../lib/format";
import { ApiError } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { SkeletonCard } from "../../components/Skeleton";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useConfirm } from "../../hooks/useConfirm";
import { IconMapPin } from "../../components/icons";

interface FormState {
  name: string;
  fromLabel: string;
  toLabel: string;
  pricePence: string;
  isAirport: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  fromLabel: "",
  toLabel: "",
  pricePence: "",
  isAirport: false,
};

export default function FixedRouteManagement() {
  const [routes, setRoutes] = useState<FixedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const { confirm, dialogProps } = useConfirm();

  const isEditing = editingId !== null;
  const formTitle = isEditing ? "Edit Route" : "Create Route";

  async function fetchRoutes() {
    try {
      const data = await listFixedRoutes();
      setRoutes(data.routes);
    } catch {
      toast.error("Failed to load fixed routes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoutes();
  }, []);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function startEdit(route: FixedRoute) {
    setEditingId(route.id);
    setForm({
      name: route.name,
      fromLabel: route.fromLabel,
      toLabel: route.toLabel,
      pricePence: String(route.pricePence),
      isAirport: route.isAirport,
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        fromLabel: form.fromLabel.trim(),
        toLabel: form.toLabel.trim(),
        pricePence: Number(form.pricePence),
        isAirport: form.isAirport,
      };

      if (isEditing && editingId) {
        await updateFixedRoute(editingId, payload);
        toast.success("Fixed route updated");
      } else {
        await createFixedRoute(payload);
        toast.success("Fixed route created");
      }

      startCreate();
      await fetchRoutes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save route");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(route: FixedRoute) {
    const ok = await confirm({
      title: "Delete Fixed Route",
      message: `Delete route "${route.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });

    if (!ok) return;

    try {
      await deleteFixedRoute(route.id);
      toast.success("Fixed route deleted");
      if (editingId === route.id) startCreate();
      await fetchRoutes();
    } catch {
      toast.error("Failed to delete route");
    }
  }

  const sortedRoutes = useMemo(
    () => [...routes].sort((a, b) => a.name.localeCompare(b.name)),
    [routes],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <p className="section-label">Admin</p>
          <h1 className="page-title mt-4 text-[40px]">Fixed routes</h1>
        </div>
        <button onClick={startCreate} className="btn-secondary button-text-compact">
          New Route
        </button>
      </div>

      <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4">
        <div>
          <p className="section-label">{formTitle}</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="field-label mb-2 block">Route Name</label>
            <input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className="input-glass w-full"
              required
              placeholder="Heathrow → Canary Wharf"
            />
          </div>
          <div>
            <label className="field-label mb-2 block">Price (pence)</label>
            <input
              type="number"
              value={form.pricePence}
              onChange={(e) => setField("pricePence", e.target.value)}
              className="input-glass w-full"
              min={1}
              required
            />
          </div>
          <div>
            <label className="field-label mb-2 block">From</label>
            <input
              value={form.fromLabel}
              onChange={(e) => setField("fromLabel", e.target.value)}
              className="input-glass w-full"
              required
              placeholder="Heathrow Airport"
            />
          </div>
          <div>
            <label className="field-label mb-2 block">To</label>
            <input
              value={form.toLabel}
              onChange={(e) => setField("toLabel", e.target.value)}
              className="input-glass w-full"
              required
              placeholder="Canary Wharf"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-[var(--color-dark)]">
          <input
            type="checkbox"
            checked={form.isAirport}
            onChange={(e) => setField("isAirport", e.target.checked)}
          />
          Airport Route
        </label>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "Saving..." : isEditing ? "Update Route" : "Create Route"}
          </button>
          {isEditing && (
            <button type="button" onClick={startCreate} className="btn-secondary flex-1">
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      {sortedRoutes.length === 0 ? (
        <div className="empty-state caption-copy">No fixed routes yet</div>
      ) : (
        <div className="space-y-2">
          {sortedRoutes.map((route) => (
            <div key={route.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="font-medium text-[var(--color-dark)] truncate">
                    {route.name}
                  </div>
                  <div className="caption-copy flex items-center gap-1.5">
                    <IconMapPin className="w-3.5 h-3.5" />
                    {route.fromLabel} → {route.toLabel}
                  </div>
                  <div className="mono-label">
                    {formatPrice(route.pricePence)}
                    {route.isAirport ? " · AIRPORT" : ""}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(route)}
                    className="btn-secondary button-text-compact"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(route)}
                    className="btn-danger button-text-compact"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
