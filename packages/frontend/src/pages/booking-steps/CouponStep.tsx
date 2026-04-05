import { useState } from "react";
import { validateCoupon } from "../../api/coupons";
import { formatPrice } from "../../lib/format";
import { ApiError } from "../../api/client";
import type { BookingData } from "../BookingFlow";

interface Props {
  pricePence: number;
  onNext: (fields: Partial<BookingData>) => void;
  onBack: () => void;
}

export default function CouponStep({ pricePence, onNext, onBack }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<{
    code: string;
    discountType: string;
    discountValue: number;
    discountPence: number;
  } | null>(null);

  async function handleApply() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await validateCoupon(code.trim());
      if (!result.valid) {
        setError(result.reason || "Invalid coupon");
        return;
      }

      let discountPence = 0;
      if (result.discountType === "percentage") {
        discountPence = Math.round(
          (pricePence * (result.discountValue || 0)) / 100,
        );
      } else {
        discountPence = Math.min(result.discountValue || 0, pricePence);
      }

      setApplied({
        code: result.code || code,
        discountType: result.discountType || "fixed",
        discountValue: result.discountValue || 0,
        discountPence,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to validate");
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    onNext({
      couponCode: applied?.code,
      discountPence: applied?.discountPence || 0,
      finalPricePence: pricePence - (applied?.discountPence || 0),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="section-label">Step 04</p>
        <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
          Have a coupon?
        </h2>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter coupon code"
          className="input-glass w-full flex-1"
        />
        <button
          onClick={handleApply}
          disabled={loading || !code.trim()}
          className="btn-secondary button-text-compact"
        >
          {loading ? "..." : "Apply"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {applied && (
        <div className="alert alert-success">
          <div className="font-medium">Coupon applied: {applied.code}</div>
          <div>
            {applied.discountType === "percentage"
              ? `${applied.discountValue}% off`
              : `${formatPrice(applied.discountValue)} off`}
            {" — "}
            You save {formatPrice(applied.discountPence)}
          </div>
          <div className="mt-1 font-medium">
            New total: {formatPrice(pricePence - applied.discountPence)}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary w-full flex-1">
          Back
        </button>
        <button onClick={handleNext} className="btn-primary w-full flex-1">
          {applied ? "Continue" : "Skip"}
        </button>
      </div>
    </div>
  );
}
