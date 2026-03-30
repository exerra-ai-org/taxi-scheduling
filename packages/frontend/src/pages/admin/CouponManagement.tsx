import { useEffect, useState } from "react";
import type { Coupon } from "shared/types";
import { listCoupons, createCoupon } from "../../api/admin";
import { formatPrice, formatDate } from "../../lib/format";
import { ApiError } from "../../api/client";
import { SkeletonCard } from "../../components/Skeleton";

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
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Coupons</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "New Coupon"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border rounded-lg p-4 mb-4 space-y-3"
        >
          {formError && (
            <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded text-xs">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full border rounded px-2 py-1.5 text-sm"
                placeholder="SUMMER20"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as "fixed" | "percentage")
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (pence)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Value {discountType === "percentage" ? "(%)" : "(pence)"}
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
                min={1}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Max Uses
                <span className="text-gray-300"> (optional)</span>
              </label>
              <input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                min={1}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Expires
              <span className="text-gray-300"> (optional)</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Coupon"}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {coupons.map((c) => {
          const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
          const maxedOut = c.maxUses !== null && c.currentUses >= c.maxUses;
          return (
            <div
              key={c.id}
              className={`bg-white border rounded-lg p-3 ${expired || maxedOut ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono font-medium text-sm">
                    {c.code}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    {c.discountType === "percentage"
                      ? `${c.discountValue}% off`
                      : `${formatPrice(c.discountValue)} off`}
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {c.currentUses}/{c.maxUses ?? "∞"} used
                </div>
              </div>
              {c.expiresAt && (
                <div className="text-xs text-gray-400 mt-1">
                  Expires: {formatDate(c.expiresAt)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
