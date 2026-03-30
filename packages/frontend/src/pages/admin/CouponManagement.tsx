import { useEffect, useState } from "react";
import type { Coupon } from "shared/types";
import { listCoupons, createCoupon } from "../../api/admin";
import { formatPrice, formatDate } from "../../lib/format";
import { ApiError } from "../../api/client";
import { SkeletonCard } from "../../components/Skeleton";
import { IconTicket } from "../../components/icons";

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
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {showForm ? "Cancel" : "New Coupon"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border rounded-xl p-5 mb-4 space-y-4"
        >
          {formError && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm border border-red-100">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="SUMMER20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Type
              </label>
              <select
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as "fixed" | "percentage")
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (pence)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Value {discountType === "percentage" ? "(%)" : "(pence)"}
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
                min={1}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Max Uses{" "}
                <span className="text-gray-300 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                min={1}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Expires{" "}
              <span className="text-gray-300 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Creating..." : "Create Coupon"}
          </button>
        </form>
      )}

      {coupons.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-50 mb-3">
            <IconTicket className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-gray-400 text-sm">No coupons yet</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Code
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Discount
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Uses
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Expires
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {coupons.map((c) => {
                  const expired =
                    c.expiresAt && new Date(c.expiresAt) < new Date();
                  const maxedOut =
                    c.maxUses !== null && c.currentUses >= c.maxUses;
                  const inactive = expired || maxedOut;
                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-gray-50 transition-colors ${inactive ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900">
                        {c.code}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {c.discountType === "percentage"
                          ? `${c.discountValue}% off`
                          : `${formatPrice(c.discountValue)} off`}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {c.currentUses}/{c.maxUses ?? "∞"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {c.expiresAt ? formatDate(c.expiresAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            inactive
                              ? "bg-gray-100 text-gray-400"
                              : "bg-green-100 text-green-700"
                          }`}
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

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {coupons.map((c) => {
              const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
              const maxedOut = c.maxUses !== null && c.currentUses >= c.maxUses;
              return (
                <div
                  key={c.id}
                  className={`bg-white border rounded-xl p-3 ${expired || maxedOut ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-semibold text-sm text-gray-900">
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
        </>
      )}
    </div>
  );
}
