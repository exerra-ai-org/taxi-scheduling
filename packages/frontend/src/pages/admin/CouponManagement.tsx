import { useEffect, useState } from "react";
import type { Coupon } from "shared/types";
import { listCoupons, createCoupon } from "../../api/admin";
import { formatPrice, formatDate } from "../../lib/format";
import { ApiError } from "../../api/client";
import { SkeletonCard } from "../../components/Skeleton";
import { IconTicket, IconPlus, IconX } from "../../components/icons";

export default function CouponManagement() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">(
    "percentage",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchCoupons() {
    try {
      const data = await listCoupons();
      setCoupons(data.coupons);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCoupons();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      await createCoupon({
        code: code.toUpperCase(),
        discountType,
        discountValue: Number(discountValue),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        maxUses: maxUses ? Number(maxUses) : undefined,
      });
      setCode("");
      setDiscountValue("");
      setExpiresAt("");
      setMaxUses("");
      setShowForm(false);
      fetchCoupons();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

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
          <h1 className="page-title">Coupons</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="page-header-btn page-header-btn-primary"
        >
          {showForm ? (
            <IconX className="h-4 w-4" />
          ) : (
            <IconPlus className="h-4 w-4" />
          )}
          <span className="page-header-btn-label">
            {showForm ? "Cancel" : "New coupon"}
          </span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="glass-card p-5 mb-4 space-y-4">
          {formError && <div className="alert alert-error">{formError}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label mb-2 block">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="input-glass w-full"
                placeholder="SUMMER20"
              />
            </div>
            <div>
              <label className="field-label mb-2 block">Type</label>
              <select
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as "fixed" | "percentage")
                }
                className="input-glass w-full"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (pence)</option>
              </select>
            </div>
            <div>
              <label className="field-label mb-2 block">
                Value {discountType === "percentage" ? "(%)" : "(pence)"}
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
                min={1}
                className="input-glass w-full"
              />
            </div>
            <div>
              <label className="field-label mb-2 block">
                Max Uses{" "}
                <span className="normal-case tracking-normal text-[var(--color-muted)]">
                  (optional)
                </span>
              </label>
              <input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                min={1}
                className="input-glass w-full"
              />
            </div>
          </div>
          <div>
            <label className="field-label mb-2 block">
              Expires{" "}
              <span className="normal-case tracking-normal text-[var(--color-muted)]">
                (optional)
              </span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="input-glass w-full"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
          >
            {submitting ? "Creating..." : "Create Coupon"}
          </button>
        </form>
      )}

      {coupons.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconTicket className="h-7 w-7" />
          </div>
          <p className="caption-copy">No coupons yet</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block glass-table">
            <table className="ds-table w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Uses</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const expired =
                    c.expiresAt && new Date(c.expiresAt) < new Date();
                  const maxedOut =
                    c.maxUses !== null && c.currentUses >= c.maxUses;
                  const inactive = expired || maxedOut;
                  return (
                    <tr key={c.id} className={inactive ? "opacity-50" : ""}>
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--color-dark)]">
                        {c.code}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-mid)]">
                        {c.discountType === "percentage"
                          ? `${c.discountValue}% off`
                          : `${formatPrice(c.discountValue)} off`}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-mid)]">
                        {c.currentUses}/{c.maxUses ?? "∞"}
                      </td>
                      <td className="px-4 py-3 mono-label">
                        {c.expiresAt ? formatDate(c.expiresAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`status-pill ${inactive ? "status-inactive" : "status-completed"}`}
                        >
                          {inactive ? "Inactive" : "Active"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {coupons.map((c) => {
              const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
              const maxedOut = c.maxUses !== null && c.currentUses >= c.maxUses;
              return (
                <div
                  key={c.id}
                  className={`glass-card p-3 ${expired || maxedOut ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm font-semibold text-[var(--color-dark)]">
                        {c.code}
                      </span>
                      <span className="caption-copy ml-2">
                        {c.discountType === "percentage"
                          ? `${c.discountValue}% off`
                          : `${formatPrice(c.discountValue)} off`}
                      </span>
                    </div>
                    <div className="mono-label">
                      {c.currentUses}/{c.maxUses ?? "∞"} used
                    </div>
                  </div>
                  {c.expiresAt && (
                    <div className="mono-label mt-1">
                      Expires: {formatDate(c.expiresAt)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
