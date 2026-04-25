import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import type { UserRole } from "shared/types";

type Mode =
  | { kind: "email" }
  | { kind: "password"; role: UserRole; name?: string }
  | { kind: "phone"; name?: string }
  | { kind: "register" };

function nextRouteForRole(role: UserRole, fallback: string): string {
  if (role === "admin") return "/admin";
  if (role === "driver") return "/driver";
  return fallback || "/";
}

export default function Login() {
  const { user, checkEmail, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "email" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(nextRouteForRole(user.role, next), { replace: true });
  }, [user, navigate, next]);

  function reset() {
    setMode({ kind: "email" });
    setPassword("");
    setPhone("");
    setName("");
    setError("");
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
        setMode({ kind: "phone", name: result.name });
      } else {
        setMode({ kind: "password", role: result.role!, name: result.name });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not look up email");
    } finally {
      setBusy(false);
    }
  }

  async function submitCredential(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let signed;
      if (mode.kind === "password") {
        signed = await login(email, { password });
      } else if (mode.kind === "phone") {
        signed = await login(email, { phone });
      } else if (mode.kind === "register") {
        signed = await register(email, name, phone);
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

  const showCredential = mode.kind !== "email";
  const greetName = (mode.kind === "password" || mode.kind === "phone") && mode.name;

  return (
    <div className="mx-auto mt-12 w-full max-w-[480px] animate-fade-in">
      <div className="mb-8">
        <p className="section-label">Account</p>
        <h1 className="page-title mt-4 text-[40px]">
          {mode.kind === "register" ? "Create your account" : "Welcome"}
        </h1>
        <p className="page-subtitle">
          {mode.kind === "email"
            ? "We'll match the email to your account."
            : mode.kind === "register"
              ? "Just a name and phone to get going."
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

          {mode.kind === "phone" && (
            <div className="animate-slide-up">
              <label className="field-label mb-2 block">/ Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoFocus
                minLength={6}
                className="ds-input"
                placeholder="07700 000000"
              />
            </div>
          )}

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
                <label className="field-label mb-2 block">/ Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  minLength={6}
                  className="ds-input"
                  placeholder="07700 000000"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`${mode.kind === "register" || mode.kind === "phone" ? "btn-green" : "btn-primary"} w-full`}
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
      </div>
    </div>
  );
}
