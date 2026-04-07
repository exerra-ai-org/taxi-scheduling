import { useCallback, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getQuote } from "../api/bookings";
import { ApiError } from "../api/client";
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

type QuoteStatus = "idle" | "loading" | "ready" | "error";

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
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("idle");
  const [quoteError, setQuoteError] = useState("");
  const quoteRequestRef = useRef(0);

  const update = useCallback((fields: Partial<BookingData>) => {
    setData((prev) => ({ ...prev, ...fields }));
  }, []);

  const fetchQuote = useCallback(async (nextData: Partial<BookingData>) => {
    const requestId = quoteRequestRef.current + 1;
    quoteRequestRef.current = requestId;
    setQuoteStatus("loading");
    setQuoteError("");

    try {
      const quote = await getQuote(
        nextData.pickupAddress || "",
        nextData.dropoffAddress || "",
        {
          fromLat: nextData.pickupLat,
          fromLon: nextData.pickupLon,
          toLat: nextData.dropoffLat,
          toLon: nextData.dropoffLon,
        },
      );

      if (quoteRequestRef.current !== requestId) return;

      setData((prev) => ({
        ...prev,
        ...nextData,
        pricePence: quote.pricePence,
        routeType: quote.routeType,
        routeName: quote.routeName,
        isAirport: quote.isAirport,
        discountPence: 0,
        couponCode: undefined,
        finalPricePence: quote.pricePence,
      }));
      setQuoteStatus("ready");
    } catch (error) {
      if (quoteRequestRef.current !== requestId) return;

      setQuoteStatus("error");
      setQuoteError(
        error instanceof ApiError ? error.message : "Failed to get price",
      );
    }
  }, []);

  const handleQuoteRequest = useCallback(
    (fields: Partial<BookingData>) => {
      const nextData = {
        ...data,
        ...fields,
        discountPence: 0,
        couponCode: undefined,
        finalPricePence: undefined,
      };

      setData((prev) => ({
        ...prev,
        ...fields,
        discountPence: 0,
        couponCode: undefined,
        finalPricePence: undefined,
      }));
      setStep(2);
      void fetchQuote(nextData);
    },
    [data, fetchQuote],
  );

  const handleRetryQuote = useCallback(() => {
    void fetchQuote(data);
  }, [data, fetchQuote]);

  function handleBackToJourney() {
    quoteRequestRef.current += 1;
    setQuoteStatus("idle");
    setQuoteError("");
    setStep(1);
  }

  function handleReset() {
    quoteRequestRef.current += 1;
    setData({
      pickupAddress: "",
      dropoffAddress: "",
      discountPence: 0,
    });
    setQuoteStatus("idle");
    setQuoteError("");
    setStep(1);
  }

  return (
    <LandingMap
      data={data}
      step={step}
      onFieldChange={update}
      onGetQuote={handleQuoteRequest}
    >
      {step === 2 && (
        <PriceDisplay
          data={data}
          status={quoteStatus}
          error={quoteError}
          onRetry={handleRetryQuote}
          onBack={handleBackToJourney}
          onNext={() => setStep(3)}
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
          onReset={handleReset}
        />
      )}
    </LandingMap>
  );
}
