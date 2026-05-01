import { api } from "./client";
import type { UserRole } from "shared/types";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  phone?: string | null;
}

export interface MeUser extends AuthUser {
  phone: string | null;
  createdAt: string;
}

export interface CheckEmailResponse {
  exists: boolean;
  role?: UserRole;
  name?: string;
  hasPassword?: boolean;
}

export function checkEmail(email: string) {
  return api.post<CheckEmailResponse>("/auth/check-email", { email });
}

export function login(
  email: string,
  credential: { password?: string; phone?: string },
) {
  return api.post<{ user: AuthUser }>("/auth/login", {
    email,
    ...credential,
  });
}

export function register(
  email: string,
  name: string,
  opts: { phone?: string; password?: string },
) {
  return api.post<{ user: AuthUser } | { magicLinkSent: true }>(
    "/auth/register",
    {
      email,
      name,
      ...opts,
    },
  );
}

export function requestMagicLink(email: string) {
  return api.post<{ message: string }>("/auth/magic-link", { email });
}

export function verifyMagicLink(token: string) {
  return api.post<{ user: AuthUser }>("/auth/magic-link/verify", { token });
}

export function requestPasswordReset(email: string) {
  return api.post<{ message: string }>("/auth/reset-password/request", {
    email,
  });
}

export function verifyPasswordReset(token: string, password: string) {
  return api.post<{ user: AuthUser }>("/auth/reset-password/verify", {
    token,
    password,
  });
}

export function acceptInvitation(token: string, password: string) {
  return api.post<{ user: AuthUser }>("/auth/accept-invitation", {
    token,
    password,
  });
}

export function updateProfile(data: { name?: string; phone?: string | null }) {
  return api.patch<{ user: AuthUser }>("/auth/me", data);
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api.patch<{ message: string }>("/auth/me/password", {
    currentPassword,
    newPassword,
  });
}

export function logout() {
  return api.post<{ message: string }>("/auth/logout");
}

export function getMe() {
  return api.get<{ user: MeUser }>("/auth/me");
}
