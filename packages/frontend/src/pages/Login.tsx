import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import type { UserRole } from "shared/types";

type Mode =
  | { kind: "email" }
  | { kind: "password"; role: UserRole; name?: string }
  | { kind: "customer-login"; name?: string; hasPassword: boolean }
  | { kind: "register" }
  | { kind: "magic-link-sent" }
  | { kind: "magic-link-verify" };

function nextRouteForRole(role: UserRole, fallback: string): string {
  if (role === "admin") return "/admin";
  if (role === "driver") return "/driver";
  return fallback || "/";
}

export default function Login() {
  const {
    user,
    checkEmail,
    login,
    register,
    requestMagicLink,
    verifyMagicLink,
  } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [magicToken, setMagicToken] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "email" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registerMethod, setRegisterMethod] = useState<
    "password" | "magic-link"
  >("password");

  useEffect(() => {
    if (user) navigate(nextRouteForRole(user.role, next), { replace: true });
  }, [user, navigate, next]);

  // Check URL for magic link token on mount
  useEffect(() => {
    const token = params.get("token");
    if (token) {
      setMagicToken(token);
      setMode({ kind: "magic-link-verify" });
      handleVerifyMagicLink(token);
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

    // Validate confirm password for registration
    if (mode.kind === "register" && registerMethod === "password") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setBusy(true);
    try {
      let signed;
      if (mode.kind === "password") {
        signed = await login(email, { password });
      } else if (mode.kind === "customer-login") {
        signed = await login(email, { password });
      } else if (mode.kind === "register") {
        signed = await register(email, name, {
          phone: phone || undefined,
          password: registerMethod === "password" ? password : undefined,
        });
      } else {
        return;
      }
      navigate(nextRouteForRole(signed.role, next), { replace: true });
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
      navigate(nextRouteForRole(signed.role, next), { replace: true });
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
    <div className="mx-auto mt-12 w-full max-w-[480px] animate-fade-in">
      <div className="mb-8">
        <p className="section-label">Account</p>
        <h1 className="page-title">
          {mode.kind === "register"
            ? "Create your account"
            : mode.kind === "magic-link-sent"
              ? "Check your email"
              : mode.kind === "magic-link-verify"
                ? "Verifying..."
                : "Welcome"}
        </h1>
        <p className="page-subtitle">
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

      <div className="page-card animate-slide-up p-6 sm:p-8">
        {error && (
          <div className="alert alert-error mb-5" role="alert">
            {error}
          </div>
        )}

        {/* Magic link sent confirmation */}
        {mode.kind === "magic-link-sent" && (
          <div className="space-y-5">
            <p className="text-sm text-neutral-400">
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
          <p className="text-sm text-neutral-400">
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
        {mode.kind !== "magic-link-sent" &&
          mode.kind !== "magic-link-verify" && (
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
                    <Link to="/reset-password" className="subtle-link text-sm">
                      Forgot password?
                    </Link>
                    <button
                      type="button"
                      className="subtle-link text-sm"
                      disabled={busy}
                      onClick={() => handleSendMagicLink("login")}
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
                    <label className="field-label mb-2 block">
                      / Full name
                    </label>
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
                      <span className="text-neutral-500 font-normal">
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
                        <label className="field-label mb-2 block">
                          / Password
                        </label>
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
                    <p className="animate-slide-up text-sm text-neutral-400">
                      We'll send a sign-in link to your email each time you log
                      in — no password needed.
                    </p>
                  )}
                </div>
              )}

              {/* Submit button */}
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
    </div>
  );
}
