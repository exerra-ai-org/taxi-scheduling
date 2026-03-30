import { useState } from "react";
import { useLocation } from "react-router-dom";
import JourneyInput from "./booking-steps/JourneyInput";
import PriceDisplay from "./booking-steps/PriceDisplay";
import CustomerDetails from "./booking-steps/CustomerDetails";
import CouponStep from "./booking-steps/CouponStep";
import Confirmation from "./booking-steps/Confirmation";

export interface BookingData {
  pickupAddress: string;
  dropoffAddress: string;
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

const STEP_LABELS = ["Journey", "Price", "Details", "Coupon", "Confirm"];

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

  return (
    <div className="mx-auto max-w-lg">
      {/* Step indicator */}
      <div className="flex items-center justify-between mb-8">
        {STEP_LABELS.map((label, i) => {
          const num = i + 1;
          const isActive = num === step;
          const isComplete = num < step;
          return (
            <div key={label} className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isComplete
                    ? "bg-green-500 text-white"
                    : isActive
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {isComplete ? "✓" : num}
              </div>
              <span className="text-xs mt-1 text-gray-500">{label}</span>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === 1 && (
        <JourneyInput
          data={data}
          onNext={(fields) => {
            update(fields);
            setStep(2);
          }}
        />
      )}
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
        <CustomerDetails onNext={() => setStep(4)} onBack={() => setStep(2)} />
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
  );
}
