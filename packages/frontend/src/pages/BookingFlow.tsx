import { useState } from "react";
import { useLocation } from "react-router-dom";
import LandingMap from "./LandingMap";
import PriceDisplay from "./booking-steps/PriceDisplay";
import CustomerDetails from "./booking-steps/CustomerDetails";
import CouponStep from "./booking-steps/CouponStep";
import Confirmation from "./booking-steps/Confirmation";

export interface BookingData {
  pickupAddress: string;
  pickupLat?: number;
  pickupLon?: number;
  dropoffAddress: string;
  dropoffLat?: number;
  dropoffLon?: number;
  date: string;
  time: string;
  pricePence: number;
  routeType: "fixed" | "zone";
  routeName: string | null;
  isAirport: boolean;
  couponCode?: string;
  discountPence: number;
  finalPricePence: number;
}

const STEPS = [
  { num: 1, label: "Journey" },
  { num: 2, label: "Price" },
  { num: 3, label: "Details" },
  { num: 4, label: "Coupon" },
  { num: 5, label: "Confirm" },
];

export default function BookingFlow() {
  const location = useLocation();
  const prefill = location.state as {
    pickupAddress?: string;
    dropoffAddress?: string;
  } | null;

  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<BookingData>>({
    pickupAddress: prefill?.pickupAddress || "",
    dropoffAddress: prefill?.dropoffAddress || "",
    discountPence: 0,
  });

  function update(fields: Partial<BookingData>) {
    setData((prev) => ({ ...prev, ...fields }));
  }

  // Step 1: full-page immersive map
  if (step === 1) {
    return (
      <LandingMap
        data={data}
        onNext={(fields) => {
          update(fields);
          setStep(2);
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-5xl items-center justify-center gap-8 py-8">
      <div className="hidden shrink-0 md:flex md:flex-col md:pt-1">
        {STEPS.map(({ num, label }, i) => {
          const isActive = num === step;
          const isComplete = num < step;
          const isLast = i === STEPS.length - 1;
          return (
            <div key={num} className="stepper-shell">
              <div className="step-row">
                <div
                  className={`step-dot ${isComplete ? "step-dot-complete" : isActive ? "step-dot-active" : ""}`}
                >
                  {isComplete ? "✓" : num}
                </div>
                <span
                  className={`step-label w-20 ${isActive ? "step-label-active" : isComplete ? "step-label-complete" : ""}`}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`step-line ${isComplete ? "step-line-complete" : ""}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex w-full items-center gap-2 md:hidden">
        {STEPS.map(({ num }) => (
          <div
            key={num}
            className={`progress-rail flex-1 ${num <= step ? "progress-rail-active" : ""}`}
          />
        ))}
      </div>

      <div className="w-full max-w-2xl min-w-0">
        {step === 2 && (
          <PriceDisplay
            data={data}
            onNext={(fields) => {
              update(fields);
              setStep(3);
            }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <CustomerDetails
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <CouponStep
            pricePence={data.pricePence || 0}
            onNext={(fields) => {
              update(fields);
              setStep(5);
            }}
            onBack={() => setStep(3)}
          />
        )}
        {step === 5 && (
          <Confirmation
            data={data as BookingData}
            onBack={() => setStep(4)}
            onReset={() => {
              setData({
                pickupAddress: "",
                dropoffAddress: "",
                discountPence: 0,
              });
              setStep(1);
            }}
          />
        )}
      </div>
    </div>
  );
}
