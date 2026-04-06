import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { checkEmail } from "../../api/auth";
import { ApiError } from "../../api/client";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export default function CustomerDetails({ onNext, onBack }: Props) {
  const { user, login, register } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [existingName, setExistingName] = useState("");
  const [mode, setMode] = useState<"check" | "existing" | "new">(
    user ? "existing" : "check",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCheckEmail() {
    if (!email.trim()) return;
    setLoading(true);
    setError("");

    try {
      const result = await checkEmail(email.trim());

      if (!result.exists) {
        setName("");
        setPhone("");
        setExistingName("");
        setMode("new");
        return;
      }

      if (result.role && result.role !== "customer") {
        setError("This email belongs to a staff account. Please use the login page.");
        setMode("check");
        return;
      }

      setExistingName(result.name || "");
      setPhone("");
      setMode("existing");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleExistingLogin() {
    if (!phone.trim()) return;

    setLoading(true);
    setError("");
    try {
      await login(email, undefined, phone);
      onNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!name.trim() || !phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      await register(email, name, phone);
      onNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  // Already logged in — show confirmation
  if (user) {
    return (
      <div className="space-y-4">
        <div>
          <p className="section-label">Step 03</p>
          <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
            Your details
          </h2>
        </div>

        <div className="glass-card space-y-3 p-4">
          <div className="data-pair">
            <span>Name</span>
            <span>{user.name}</span>
          </div>
          <div className="data-pair">
            <span>Email</span>
            <span>{user.email}</span>
          </div>
          {user.phone && (
            <div className="data-pair">
              <span>Phone</span>
              <span>{user.phone}</span>
            </div>
          )}
        </div>

        <div className="alert alert-success">Welcome back, {user.name}!</div>

        <div className="flex gap-3">
          <button onClick={onBack} className="btn-secondary flex-1">
            Back
          </button>
          <button onClick={onNext} className="btn-primary flex-1">
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="section-label">Step 03</p>
        <h2 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.04em] text-[var(--color-dark)]">
          Your details
        </h2>
      </div>
      <p className="caption-copy">
        {mode === "check"
          ? "Enter your email to find your account"
          : mode === "existing"
            ? "Account found. Enter your phone number to continue"
            : "Complete your details to create an account"}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div>
        <label className="field-label mb-2 block">Email</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
              if (mode !== "check") setMode("check");
            }}
            required
            placeholder="you@example.com"
            className="input-glass flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && mode === "check") {
                e.preventDefault();
                handleCheckEmail();
              }
            }}
          />
          {mode === "check" && (
            <button
              onClick={handleCheckEmail}
              disabled={loading || !email.trim()}
              className="btn-primary button-text-compact"
            >
              {loading ? "..." : "Check"}
            </button>
          )}
        </div>
      </div>

      {mode === "existing" && (
        <>
          <div className="alert alert-info">
            {existingName ? `Welcome back, ${existingName}.` : "Existing account found."} Verify your phone number to continue.
          </div>
          <div>
            <label className="field-label mb-2 block">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="07700 000 000"
              className="input-glass w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleExistingLogin();
                }
              }}
            />
          </div>
        </>
      )}

      {mode === "new" && (
        <>
          <div className="alert alert-info">
            No account found. Fill in your details to create one.
          </div>
          <div>
            <label className="field-label mb-2 block">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="John Smith"
              className="input-glass w-full"
            />
          </div>
          <div>
            <label className="field-label mb-2 block">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="07700 000 000"
              className="input-glass w-full"
            />
          </div>
        </>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary flex-1">
          Back
        </button>
        {mode === "new" && (
          <button
            onClick={handleRegister}
            disabled={loading || !name.trim() || !phone.trim()}
            className="btn-primary flex-1"
          >
            {loading ? "Creating account..." : "Continue"}
          </button>
        )}
        {mode === "existing" && (
          <button
            onClick={handleExistingLogin}
            disabled={loading || !phone.trim()}
            className="btn-primary flex-1"
          >
            {loading ? "Signing in..." : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}
