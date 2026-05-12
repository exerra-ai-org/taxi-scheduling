import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../api/client";
import type { AuthUser } from "../../api/auth";

type Tab = "sign-in" | "sign-up";

type Mode =
  | { kind: "form"; tab: Tab }
  | { kind: "magic-link-sent" }
  | { kind: "magic-link-verify" };

interface Props {
  /** Called once a user is signed in. The caller decides what to do next
   *  (navigate, close modal, etc.). */
  onSuccess: (user: AuthUser) => void;
  /** If provided, the email is pre-filled. */
  initialEmail?: string;
  /** Pre-filled magic-link token (e.g., from URL ?token=...). When set,
   *  AuthForm enters magic-link-verify on mount. */
  initialToken?: string;
  /** Render the "forgot password" link. False inside the booking modal,
   *  where a link-out would lose the booking state. */
  showResetLink?: boolean;
  /** Compact heading omitted when the host (modal) provides its own. */
  showHeader?: boolean;
  /** Which tab opens first. */
  initialTab?: Tab;
}

export default function AuthForm({
  onSuccess,
  initialEmail = "",
  initialToken,
  showResetLink = true,
  showHeader = true,
  initialTab = "sign-in",
}: Props) {
  const { login, register, requestMagicLink, verifyMagicLink } = useAuth();

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [magicToken, setMagicToken] = useState(initialToken ?? "");
  const [mode, setMode] = useState<Mode>(
    initialToken
      ? { kind: "magic-link-verify" }
      : { kind: "form", tab: initialTab },
  );
  const [signInMethod, setSignInMethod] = useState<"password" | "magic-link">(
    "password",
  );
  const [registerMethod, setRegisterMethod] = useState<
    "password" | "magic-link"
  >("password");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialToken) {
      void handleVerifyMagicLink(initialToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(tab: Tab) {
    setError("");
    setPassword("");
    setConfirmPassword("");
    setMode({ kind: "form", tab });
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (signInMethod === "magic-link") {
        await requestMagicLink(email);
        setMode({ kind: "magic-link-sent" });
        return;
      }
      const signed = await login(email, { password });
      onSuccess(signed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!termsAccepted) {
      setError("You must accept the terms to create an account.");
      return;
    }
    if (registerMethod === "password" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      const result = await register(email, name, {
        phone: phone || undefined,
        password: registerMethod === "password" ? password : undefined,
        termsAccepted: true,
      });
      if ("magicLinkSent" in result) {
        setMode({ kind: "magic-link-sent" });
        return;
      }
      onSuccess(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyMagicLink(token?: string) {
    setError("");
    setBusy(true);
    try {
      const signed = await verifyMagicLink(token || magicToken);
      onSuccess(signed);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Invalid or expired magic link",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResendMagicLink() {
    setError("");
    setBusy(true);
    try {
      await requestMagicLink(email);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not resend magic link",
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Magic-link sub-views ─────────────────────────────────────────────
  if (mode.kind === "magic-link-sent") {
    return (
      <div className="animate-fade-in space-y-5">
        {showHeader && (
          <div>
            <p className="section-label">Account</p>
            <h2 className="text-[26px] font-bold leading-tight tracking-[-0.04em] text-[var(--color-dark)]">
              Check your email
            </h2>
            <p className="caption-copy mt-1">
              We sent a sign-in link to {email}.
            </p>
          </div>
        )}
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <p className="text-sm text-[var(--color-muted)]">
          Click the link in your email to sign in. The link expires in 15
          minutes.
        </p>
        <div>
          <label className="field-label mb-2 block">
            / Or paste your token
          </label>
          <input
            type="text"
            value={magicToken}
            onChange={(e) => setMagicToken(e.target.value)}
            className="ds-input"
            placeholder="Paste token from email"
          />
        </div>
        <button
          type="button"
          disabled={busy || !magicToken}
          className="btn-primary w-full"
          onClick={() => handleVerifyMagicLink()}
        >
          <span>{busy ? "Verifying..." : "Verify token"}</span>
          <span className="btn-icon" aria-hidden="true">
            <span className="btn-icon-glyph">↗</span>
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          className="subtle-link block w-full text-center"
          onClick={handleResendMagicLink}
        >
          Resend magic link
        </button>
        <button
          type="button"
          className="subtle-link block w-full text-center"
          onClick={() => switchTab("sign-in")}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  if (mode.kind === "magic-link-verify") {
    return (
      <div className="animate-fade-in space-y-4">
        {!error && (
          <p className="text-sm text-[var(--color-muted)]">
            Verifying your magic link...
          </p>
        )}
        {error && (
          <>
            <div className="alert alert-error" role="alert">
              {error}
            </div>
            <button
              type="button"
              className="subtle-link block w-full text-center"
              onClick={() => switchTab("sign-in")}
            >
              Back to sign in
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Tabbed forms ─────────────────────────────────────────────────────
  const isSignIn = mode.tab === "sign-in";

  return (
    <div className="animate-fade-in">
      {showHeader && (
        <div className="mb-6">
          <p className="section-label">Account</p>
          <h2 className="text-[26px] font-bold leading-tight tracking-[-0.04em] text-[var(--color-dark)]">
            {isSignIn ? "Welcome back" : "Create your account"}
          </h2>
          <p className="caption-copy mt-1">
            {isSignIn
              ? "Sign in to continue."
              : "Just a few details to get started."}
          </p>
        </div>
      )}

      {/* Tab switcher */}
      <div className="mb-5 flex gap-2 rounded-lg border border-neutral-700 bg-neutral-900/30 p-1">
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isSignIn
              ? "bg-white text-black"
              : "bg-transparent text-neutral-300 hover:text-white"
          }`}
          onClick={() => switchTab("sign-in")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            !isSignIn
              ? "bg-white text-black"
              : "bg-transparent text-neutral-300 hover:text-white"
          }`}
          onClick={() => switchTab("sign-up")}
        >
          Sign up
        </button>
      </div>

      {error && (
        <div className="alert alert-error mb-5" role="alert">
          {error}
        </div>
      )}

      {isSignIn ? (
        <form onSubmit={handleSignIn} className="space-y-5">
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

          <div>
            <label className="field-label mb-2 block">/ Method</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  signInMethod === "password"
                    ? "border-white bg-white text-black"
                    : "border-neutral-700 bg-transparent text-neutral-400 hover:border-neutral-500"
                }`}
                onClick={() => setSignInMethod("password")}
              >
                Password
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  signInMethod === "magic-link"
                    ? "border-white bg-white text-black"
                    : "border-neutral-700 bg-transparent text-neutral-400 hover:border-neutral-500"
                }`}
                onClick={() => setSignInMethod("magic-link")}
              >
                Email link
              </button>
            </div>
          </div>

          {signInMethod === "password" && (
            <div className="animate-slide-up space-y-2">
              <label className="field-label mb-2 block">/ Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="ds-input"
                placeholder="••••••••"
              />
              {showResetLink && (
                <Link
                  to="/reset-password"
                  className="subtle-link block text-sm"
                >
                  Forgot password?
                </Link>
              )}
            </div>
          )}

          {signInMethod === "magic-link" && (
            <p className="animate-slide-up text-sm text-[var(--color-muted)]">
              We'll email you a one-time sign-in link — no password needed.
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            <span>
              {busy
                ? signInMethod === "magic-link"
                  ? "Sending..."
                  : "Signing in..."
                : signInMethod === "magic-link"
                  ? "Send sign-in link"
                  : "Sign in"}
            </span>
            <span className="btn-icon" aria-hidden="true">
              <span className="btn-icon-glyph">↗</span>
            </span>
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignUp} className="space-y-5">
          <div>
            <label className="field-label mb-2 block">/ Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="ds-input"
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <label className="field-label mb-2 block">/ Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="ds-input"
              placeholder="you@domain.com"
            />
          </div>

          <div>
            <label className="field-label mb-2 block">
              / Phone{" "}
              <span className="text-[var(--color-muted)] font-normal">
                (optional)
              </span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              minLength={6}
              className="ds-input"
              placeholder="07700 000000"
            />
          </div>

          <div>
            <label className="field-label mb-2 block">/ Sign-in method</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  registerMethod === "password"
                    ? "border-white bg-white text-black"
                    : "border-neutral-700 bg-transparent text-neutral-400 hover:border-neutral-500"
                }`}
                onClick={() => setRegisterMethod("password")}
              >
                Password
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  registerMethod === "magic-link"
                    ? "border-white bg-white text-black"
                    : "border-neutral-700 bg-transparent text-neutral-400 hover:border-neutral-500"
                }`}
                onClick={() => setRegisterMethod("magic-link")}
              >
                Email link
              </button>
            </div>
          </div>

          {registerMethod === "password" && (
            <div className="animate-slide-up space-y-5">
              <div>
                <label className="field-label mb-2 block">/ Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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
            </div>
          )}

          {registerMethod === "magic-link" && (
            <p className="animate-slide-up text-sm text-[var(--color-muted)]">
              We'll send a sign-in link to your email each time you log in — no
              password needed.
            </p>
          )}

          <label className="flex items-start gap-3 text-sm text-[var(--color-mid)]">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              required
              className="mt-1 h-4 w-4 accent-[var(--color-green)]"
            />
            <span>
              I agree to the{" "}
              <Link
                to="/terms"
                target="_blank"
                rel="noreferrer"
                className="subtle-link"
              >
                Terms &amp; Conditions
              </Link>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={busy || !termsAccepted}
            className="btn-green w-full"
          >
            <span>{busy ? "Creating..." : "Create account"}</span>
            <span className="btn-icon" aria-hidden="true">
              <span className="btn-icon-glyph">↗</span>
            </span>
          </button>
        </form>
      )}
    </div>
  );
}
