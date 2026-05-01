import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import SignInModal from "../../components/auth/SignInModal";
import type { BookingData } from "../BookingFlow";

interface Props {
  data: Partial<BookingData>;
  onNext: () => void;
  onBack: () => void;
  onUpdate: (fields: Partial<BookingData>) => void;
}

export default function CustomerDetails({ onNext, onBack }: Props) {
  const { user } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-[22px] font-bold leading-none tracking-[-0.03em] text-[var(--color-dark)]">
        Your details
      </h2>

      {user ? (
        <div className="page-card space-y-3 p-5">
          <div className="data-pair">
            <span>NAME</span>
            <span>{user.name}</span>
          </div>
          <div className="data-pair">
            <span>EMAIL</span>
            <span>{user.email}</span>
          </div>
          {user.phone && (
            <div className="data-pair">
              <span>PHONE</span>
              <span>{user.phone}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="page-card p-5 space-y-3">
          <p className="section-label">Account</p>
          <p className="body-copy">
            Sign in or create an account to confirm your booking. Your booking
            details stay in place.
          </p>
          <button
            type="button"
            onClick={() => setSignInOpen(true)}
            className="btn-green w-full"
          >
            <span>Sign in to continue</span>
            <span className="btn-icon" aria-hidden="true">
              <span className="btn-icon-glyph">↗</span>
            </span>
          </button>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="btn-secondary flex-1">
          <span>Back</span>
        </button>
        <button
          onClick={onNext}
          disabled={!user}
          className="btn-primary flex-1"
        >
          <span>Continue</span>
          <span className="btn-icon" aria-hidden="true">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
      </div>

      <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}
