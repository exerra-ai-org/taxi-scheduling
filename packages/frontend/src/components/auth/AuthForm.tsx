import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../api/client";
import type { AuthUser } from "../../api/auth";
import type { UserRole } from "shared/types";

type Mode =
  | { kind: "email" }
  | { kind: "password"; role: UserRole; name?: string }
  | { kind: "customer-login"; name?: string; hasPassword: boolean }
  | { kind: "register" }
  | { kind: "magic-link-sent" }
  | { kind: "magic-link-verify" };

interface Props {
  /** Called once a user is signed in. The caller decides what to do next
   *  (navigate, close modal, etc.). */
  onSuccess: (user: AuthUser) => void;
  /** If provided, the email step is pre-filled. */
  initialEmail?: string;
  /** Pre-filled magic-link token (e.g., from URL ?token=...). When set,
   *  AuthForm enters magic-link-verify on mount. */
  initialToken?: string;
  /** Render the "forgot password" link. False inside the booking modal,
   *  where a link-out would lose the booking state. */
  showResetLink?: boolean;
  /** Compact heading omitted when the host (modal) provides its own. */
  showHeader?: boolean;
}

export default function AuthForm({
  onSuccess,
  initialEmail = "",
  initialToken,
  showResetLink = true,
  showHeader = true,
}: Props) {
  const { checkEmail, login, register, requestMagicLink, verifyMagicLink } =
    useAuth();

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [magicToken, setMagicToken] = useState(initialToken ?? "");
  const [mode, setMode] = useState<Mode>(
    initialToken ? { kind: "magic-link-verify" } : { kind: "email" },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registerMethod, setRegisterMethod] = useState<
    "password" | "magic-link"
  >("password");

  // If we mount with a token from the URL, kick off verification.
  useEffect(() => {
    if (initialToken) {
      void handleVerifyMagicLink(initialToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setMode({ kind: "email" });
    setPassword("");
    setConfirmPassword("");
    setPhone("");
    setName("");
    setMagicToken("");
    setError("");
    setRegisterMethod("password");
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setError("");
    setBusy(true);
    try {
      const result = await checkEmail(email);
      if (!result.exists) {
        setMode({ kind: "register" });
      } else if (result.role === "customer") {
        setMode({
          kind: "customer-login",
          name: result.name,
          hasPassword: !!result.hasPassword,
        });
      } else {
        setMode({ kind: "password", role: result.role!, name: result.name });
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not look up email",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCredential(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (mode.kind === "register" && registerMethod === "password") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setBusy(true);
    try {
      let signed: AuthUser | undefined;
      if (mode.kind === "password") {
        signed = await login(email, { password });
      } else if (mode.kind === "customer-login") {
        signed = await login(email, { password });
      } else if (mode.kind === "register") {
        const result = await register(email, name, {
          phone: phone || undefined,
          password: registerMethod === "password" ? password : undefined,
        });
        if ("magicLinkSent" in result) {
          setMode({ kind: "magic-link-sent" });
          return;
        }
        signed = result;
      } else {
        return;
      }
      if (signed) onSuccess(signed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendMagicLink() {
    setError("");
    setBusy(true);
    try {
      await requestMagicLink(email);
      setMode({ kind: "magic-link-sent" });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not send magic link",
      );
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

  const showCredential = mode.kind !== "email";
  const greetName =
    (mode.kind === "password" || mode.kind === "customer-login") && mode.name;

  return (
    <div className="animate-fade-in">
      {showHeader && (
        <div className="mb-6">
          <p className="section-label">Account</p>
          <h2 className="text-[26px] font-bold leading-tight tracking-[-0.04em] text-[var(--color-dark)]">
            {mode.kind === "register"
              ? "Create your account"
              : mode.kind === "magic-link-sent"
                ? "Check your email"
                : mode.kind === "magic-link-verify"
                  ? "Verifying..."
                  : "Welcome"}
          </h2>
          <p className="caption-copy mt-1">
            {mode.kind === "email"
              ? "We'll match the email to your account."
              : mode.kind === "register"
                ? "Choose how you'd like to sign in."
                : mode.kind === "magic-link-sent"
                  ? `We sent a sign-in link to ${email}.`
                  : mode.kind === "magic-link-verify"
                    ? "Checking your magic link..."
                    : greetName
                      ? `Signing in as ${greetName}.`
                      : "Confirm it's you."}
          </p>
        </div>
      )}

      {error && (
        <div className="alert alert-error mb-5" role="alert">
          {error}
        </div>
      )}

      {/* Magic link sent confirmation */}
      {mode.kind === "magic-link-sent" && (
        <div className="space-y-5">
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
            onClick={() => handleSendMagicLink()}
          >
            Resend magic link
          </button>
          <button
            type="button"
            className="subtle-link block w-full text-center"
            onClick={reset}
          >
            Use a different email
          </button>
        </div>
      )}

      {/* Magic link verify (from URL token) */}
      {mode.kind === "magic-link-verify" && !error && (
        <p className="text-sm text-[var(--color-muted)]">
          Verifying your magic link...
        </p>
      )}
      {mode.kind === "magic-link-verify" && error && (
        <div className="space-y-4">
          <button
            type="button"
            className="subtle-link block w-full text-center"
            onClick={reset}
          >
            Back to login
          </button>
        </div>
      )}

      {/* Main forms */}
      {mode.kind !== "magic-link-sent" && mode.kind !== "magic-link-verify" && (
        <form
          onSubmit={showCredential ? submitCredential : submitEmail}
          className="space-y-5"
        >
          <div>
            <label className="field-label mb-2 block">/ Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={mode.kind === "email"}
              disabled={showCredential || busy}
              className="ds-input"
              placeholder="you@domain.com"
            />
          </div>

          {/* Staff password login */}
          {mode.kind === "password" && (
            <div className="animate-slide-up">
              <label className="field-label mb-2 block">/ Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="ds-input"
                placeholder="••••••••"
              />
            </div>
          )}

          {/* Customer login — always show password field with fallback options */}
          {mode.kind === "customer-login" && (
            <div className="animate-slide-up space-y-5">
              <div>
                <label className="field-label mb-2 block">/ Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="ds-input"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                {showResetLink ? (
                  <Link to="/reset-password" className="subtle-link text-sm">
                    Forgot password?
                  </Link>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="subtle-link text-sm"
                  disabled={busy}
                  onClick={() => handleSendMagicLink()}
                >
                  Use email link instead
                </button>
              </div>
            </div>
          )}

          {/* Registration form */}
          {mode.kind === "register" && (
            <div className="animate-slide-up space-y-5">
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

              {/* Auth method toggle */}
              <div>
                <label className="field-label mb-2 block">
                  / Sign-in method
                </label>
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
                  We'll send a sign-in link to your email each time you log in —
                  no password needed.
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`${mode.kind === "register" ? "btn-green" : "btn-primary"} w-full`}
          >
            <span>
              {busy
                ? mode.kind === "email"
                  ? "Checking..."
                  : "Signing in..."
                : mode.kind === "email"
                  ? "Continue"
                  : mode.kind === "register"
                    ? "Create account"
                    : "Sign in"}
            </span>
            <span className="btn-icon" aria-hidden="true">
              <span className="btn-icon-glyph">↗</span>
            </span>
          </button>

          {showCredential && (
            <button
              type="button"
              className="subtle-link block w-full text-center"
              onClick={reset}
            >
              Use a different email
            </button>
          )}
        </form>
      )}
    </div>
  );
}
