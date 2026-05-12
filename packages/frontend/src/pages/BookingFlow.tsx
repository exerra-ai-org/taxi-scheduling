import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import MapBackdrop, {
  type ActiveField,
  type Coords,
} from "./booking/MapBackdrop";
import JourneyPanel from "./booking/JourneyPanel";
import StepProgress from "./booking/StepProgress";
import VehicleSelect from "./booking-steps/VehicleSelect";
import PriceDisplay from "./booking-steps/PriceDisplay";
import CustomerDetails from "./booking-steps/CustomerDetails";
import CouponStep from "./booking-steps/CouponStep";
import Confirmation from "./booking-steps/Confirmation";
import PaymentStep from "./booking-steps/PaymentStep";
import type { BookingPaymentInit } from "../api/bookings";
import type { VehicleClass } from "shared/types";
import { useBottomSheet } from "../hooks/useBottomSheet";

export interface BookingData {
  pickupAddress: string;
  pickupLat?: number;
  pickupLon?: number;
  dropoffAddress: string;
  dropoffLat?: number;
  dropoffLon?: number;
  date: string;
  time: string;

  vehicleClass: VehicleClass;
  pricePence: number;
  routeType: "fixed" | "mile";
  routeName: string | null;
  isAirport: boolean;
  isPickupAirport: boolean;
  isDropoffAirport: boolean;
  distanceMiles?: number | null;
  baseFarePence?: number | null;
  ratePerMilePence?: number | null;

  pickupFlightNumber?: string;
  dropoffFlightNumber?: string;

  couponCode?: string;
  discountPence: number;
  finalPricePence: number;

  // Selected on the Confirmation step. `cash` charges a 25% deposit via
  // Stripe and the balance is collected in person.
  paymentMethod?: "card" | "cash";
}

const STORAGE_KEY = "taxi.booking.draft";

const STEP_LABELS = [
  "JOURNEY",
  "VEHICLE",
  "PRICE",
  "DETAILS",
  "COUPON",
  "REVIEW",
  "PAY",
];

function loadDraft(): Partial<BookingData> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<BookingData>) : null;
  } catch {
    return null;
  }
}

function saveDraft(data: Partial<BookingData>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function clearBookingDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export default function BookingFlow() {
  const location = useLocation();
  const prefill = location.state as {
    pickupAddress?: string;
    dropoffAddress?: string;
  } | null;

  const draft = loadDraft();
  const initialStep =
    draft && draft.pickupAddress && draft.dropoffAddress
      ? draft.vehicleClass
        ? draft.pricePence
          ? 4
          : 3
        : 2
      : 1;

  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [data, setData] = useState<Partial<BookingData>>({
    pickupAddress: prefill?.pickupAddress || draft?.pickupAddress || "",
    dropoffAddress: prefill?.dropoffAddress || draft?.dropoffAddress || "",
    discountPence: 0,
    ...(draft || {}),
  });
  // Set when Confirmation successfully creates a booking + payment intent.
  // Drives the PaymentStep at step 7. Not persisted — if the user reloads
  // the page mid-payment the hold-expiry job releases the slot.
  const [pendingPayment, setPendingPayment] = useState<{
    bookingId: number;
    payment: BookingPaymentInit;
  } | null>(null);

  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [pendingPick, setPendingPick] = useState<{
    field: ActiveField;
    lat: number;
    lon: number;
    address: string;
  } | null>(null);

  // Direction-aware step navigation: the new card enters from the side that
  // matches the direction of progress.
  const goToStep = useCallback(
    (next: number) => {
      setDirection(next >= step ? "forward" : "back");
      setStep(next);
    },
    [step],
  );

  useEffect(() => {
    saveDraft(data);
  }, [data]);

  const update = useCallback((fields: Partial<BookingData>) => {
    setData((prev) => ({ ...prev, ...fields }));
  }, []);

  const reset = useCallback(() => {
    clearBookingDraft();
    setData({ pickupAddress: "", dropoffAddress: "", discountPence: 0 });
    setDirection("back");
    setStep(1);
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (step !== 1 || !activeField) return;
      // Reverse geocode then push pending pick to JourneyPanel
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      )
        .then((r) => r.json())
        .then((resp) => {
          const address =
            resp?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          setPendingPick({ field: activeField, lat, lon: lng, address });
        })
        .catch(() => {
          setPendingPick({
            field: activeField,
            lat,
            lon: lng,
            address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          });
        });
    },
    [step, activeField],
  );

  const consumePendingPick = useCallback(() => setPendingPick(null), []);

  // Pass live coords (incl. unsaved JourneyPanel state via update from JourneyPanel)
  const pickup: Coords | null =
    data.pickupLat != null && data.pickupLon != null
      ? { lat: data.pickupLat, lon: data.pickupLon }
      : null;
  const dropoff: Coords | null =
    data.dropoffLat != null && data.dropoffLon != null
      ? { lat: data.dropoffLat, lon: data.dropoffLon }
      : null;

  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 810px)").matches;

  // Measure panel size for map fit padding (so the route never sits under the panel)
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    handleRef,
    isOpen: sheetOpen,
    setIsOpen: setSheetOpen,
  } = useBottomSheet(panelRef);

  // Auto-open the sheet when advancing beyond step 1 on mobile.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!isDesktop) setSheetOpen(true);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!panelRef.current) return;
    const ro = new ResizeObserver(() => {
      if (panelRef.current) {
        setPanelSize({
          width: panelRef.current.offsetWidth,
          height: panelRef.current.offsetHeight,
        });
      }
    });
    ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, []);

  // Measure inner content height so the panel itself morphs (height transition
  // synchronized with the inner step swap) instead of jumping between steps.
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(
    undefined,
  );
  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const measure = () => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.scrollHeight);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, []);

  // Re-measure on every step change so the morph picks up the new content
  // height immediately without waiting for ResizeObserver's async tick.
  useLayoutEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [step]);
  const obstruct = isDesktop
    ? { top: 80, left: 60, right: panelSize.width + 48, bottom: 60 }
    : { top: 60, left: 40, right: 40, bottom: panelSize.height + 32 };

  return (
    <div className="fixed inset-0 top-[72px] overflow-hidden">
      <MapBackdrop
        pickup={pickup}
        dropoff={dropoff}
        activeField={step === 1 ? activeField : null}
        onMapClick={step === 1 ? handleMapClick : undefined}
        onPickupDrag={
          step === 1
            ? (c) => update({ pickupLat: c.lat, pickupLon: c.lon })
            : undefined
        }
        onDropoffDrag={
          step === 1
            ? (c) => update({ dropoffLat: c.lat, dropoffLon: c.lon })
            : undefined
        }
        obstruct={obstruct}
      />

      {!pickup && !dropoff && step === 1 && (
        <div className="pointer-events-none absolute left-1/2 top-6 z-[1001] hidden -translate-x-1/2 animate-fade-in rounded-[64px] border border-[var(--color-border)] bg-[rgb(255_255_255_/_0.94)] px-5 py-3 text-sm font-medium text-[var(--color-dark)] shadow-[var(--shadow-card)] md:block">
          Enter your pickup and drop-off locations to get started
        </div>
      )}

      {/* Floating panel — slides from center to right after step 1 so the
          live route on the map gets full visual real estate. The panel itself
          morphs height as steps change (height tracks the inner wrapper). */}
      <div
        ref={panelRef}
        className={`floating-panel booking-flow-panel${sheetOpen ? " sheet-open" : ""}`}
        data-anchor={step === 1 ? "center" : "right"}
        style={
          isDesktop && contentHeight ? { height: contentHeight } : undefined
        }
      >
        <div
          ref={handleRef}
          className="sheet-handle"
          aria-hidden="true"
          onClick={() => setSheetOpen((v) => !v)}
        >
          <div className="sheet-handle-pill" />
        </div>
        <div ref={contentRef} className="booking-flow-panel-inner">
          {isDesktop && (
            <div className="mb-5">
              <StepProgress step={step} total={7} labels={STEP_LABELS} />
            </div>
          )}

          <div
            key={step}
            data-step-content
            className={
              direction === "forward"
                ? "animate-step-forward"
                : "animate-step-back"
            }
          >
            {step === 1 && (
              <JourneyPanel
                data={data}
                activeField={activeField}
                setActiveField={setActiveField}
                pendingPick={pendingPick}
                consumePendingPick={consumePendingPick}
                onNext={(fields) => {
                  update(fields);
                  goToStep(2);
                }}
              />
            )}
            {step === 2 && (
              <VehicleSelect
                data={data}
                onNext={(fields) => {
                  update(fields);
                  goToStep(3);
                }}
                onBack={() => goToStep(1)}
              />
            )}
            {step === 3 && (
              <PriceDisplay
                data={data}
                onNext={() => goToStep(4)}
                onBack={() => goToStep(2)}
              />
            )}
            {step === 4 && (
              <CustomerDetails
                data={data}
                onNext={() => goToStep(5)}
                onBack={() => goToStep(3)}
                onUpdate={update}
              />
            )}
            {step === 5 && (
              <CouponStep
                pricePence={data.pricePence || 0}
                onNext={(fields) => {
                  update(fields);
                  goToStep(6);
                }}
                onBack={() => goToStep(4)}
              />
            )}
            {step === 6 && (
              <Confirmation
                data={data as BookingData}
                onBack={() => goToStep(5)}
                onReset={reset}
                onBookingCreated={(bookingId, payment) => {
                  if (payment) {
                    setPendingPayment({ bookingId, payment });
                    goToStep(7);
                  }
                }}
              />
            )}
            {step === 7 && pendingPayment && (
              <PaymentStep
                bookingId={pendingPayment.bookingId}
                payment={pendingPayment.payment}
                onBack={() => goToStep(6)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
