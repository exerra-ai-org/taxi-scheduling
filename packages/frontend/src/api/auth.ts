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
}

export function checkEmail(email: string) {
  return api.post<CheckEmailResponse>("/api/auth/check-email", { email });
}

export function login(
  email: string,
  credential: { password?: string; phone?: string },
) {
  return api.post<{ user: AuthUser }>("/api/auth/login", {
    email,
    ...credential,
  });
}

export function register(email: string, name: string, phone: string) {
  return api.post<{ user: AuthUser }>("/api/auth/register", {
    email,
    name,
    phone,
  });
}

export function logout() {
  return api.post<{ message: string }>("/api/auth/logout");
}

export function getMe() {
  return api.get<{ user: MeUser }>("/api/auth/me");
}
