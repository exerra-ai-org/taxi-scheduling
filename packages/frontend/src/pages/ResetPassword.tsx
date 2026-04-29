import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { requestPasswordReset, verifyPasswordReset } from "../api/auth";
import { ApiError } from "../api/client";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);

  // If there's a token in the URL, skip straight to the set-password form
  const hasToken = Boolean(token);

  useEffect(() => {
    document.title = "Reset password";
  }, []);

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await verifyPasswordReset(token, password);
      setDone(true);
      setTimeout(() => navigate("/", { replace: true }), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-12 w-full max-w-[480px] animate-fade-in">
      <div className="mb-8">
        <p className="section-label">Account</p>
        <h1 className="page-title">
          {done
            ? "Password updated"
            : hasToken
              ? "Set new password"
              : sent
                ? "Check your email"
                : "Reset password"}
        </h1>
        <p className="page-subtitle">
          {done
            ? "You're signed in. Redirecting..."
            : hasToken
              ? "Choose a new password for your account."
              : sent
                ? `We sent a reset link to ${email}. It expires in 15 minutes.`
                : "Enter your email and we'll send you a reset link."}
        </p>
      </div>

      <div className="page-card animate-slide-up p-6 sm:p-8">
        {error && (
          <div className="alert alert-error mb-5" role="alert">
            {error}
          </div>
        )}

        {done && (
          <p className="text-sm text-neutral-400">Taking you to the app...</p>
        )}

        {/* Request reset form */}
        {!hasToken && !sent && !done && (
          <form onSubmit={handleRequestReset} className="space-y-5">
            <div>
              <label className="field-label mb-2 block">/ Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="ds-input"
                placeholder="you@domain.com"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full"
            >
              <span>{busy ? "Sending..." : "Send reset link"}</span>
              <span className="btn-icon" aria-hidden="true">
                <span className="btn-icon-glyph">↗</span>
              </span>
            </button>
            <Link to="/login" className="subtle-link block w-full text-center">
              Back to sign in
            </Link>
          </form>
        )}

        {/* Sent confirmation */}
        {!hasToken && sent && !done && (
          <div className="space-y-5">
            <p className="text-sm text-neutral-400">
              Didn't get it? Check your spam folder or{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setSent(false)}
              >
                try again
              </button>
              .
            </p>
            <Link to="/login" className="subtle-link block w-full text-center">
              Back to sign in
            </Link>
          </div>
        )}

        {/* Set new password form */}
        {hasToken && !done && (
          <form onSubmit={handleSetPassword} className="space-y-5">
            <div>
              <label className="field-label mb-2 block">/ New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                minLength={8}
                className="ds-input"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="field-label mb-2 block">
                / Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="ds-input"
                placeholder="Re-enter your password"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full"
            >
              <span>{busy ? "Updating..." : "Set new password"}</span>
              <span className="btn-icon" aria-hidden="true">
                <span className="btn-icon-glyph">↗</span>
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
