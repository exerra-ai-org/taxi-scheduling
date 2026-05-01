import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthForm from "../components/auth/AuthForm";
import type { AuthUser } from "../api/auth";
import type { UserRole } from "shared/types";

function nextRouteForRole(role: UserRole, fallback: string): string {
  if (role === "admin") return "/admin";
  if (role === "driver") return "/driver";
  return fallback || "/";
}

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const tokenFromUrl = params.get("token") ?? undefined;

  useEffect(() => {
    if (user) navigate(nextRouteForRole(user.role, next), { replace: true });
  }, [user, navigate, next]);

  function handleSuccess(signed: AuthUser) {
    navigate(nextRouteForRole(signed.role, next), { replace: true });
  }

  return (
    <div className="mx-auto mt-12 w-full max-w-[480px]">
      <div className="page-card animate-slide-up p-6 sm:p-8">
        <AuthForm
          onSuccess={handleSuccess}
          initialToken={tokenFromUrl}
          showResetLink={true}
          showHeader={true}
        />
      </div>
    </div>
  );
}
