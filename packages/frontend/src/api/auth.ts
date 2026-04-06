import { api } from "./client";

interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin" | "driver";
  phone?: string | null;
}

interface MeUser extends AuthUser {
  phone: string | null;
  createdAt: string;
}

export async function login(email: string, password?: string, phone?: string) {
  return api.post<{ user: AuthUser }>("/api/auth/login", {
    email,
    password,
    phone,
  });
}

export async function checkEmail(email: string) {
  return api.post<{
    exists: boolean;
    role?: "customer" | "admin" | "driver";
    name?: string;
  }>("/api/auth/check-email", { email });
}

export async function register(email: string, name: string, phone: string) {
  return api.post<{ user: AuthUser }>("/api/auth/register", {
    email,
    name,
    phone,
  });
}

export async function logout() {
  return api.post<{ message: string }>("/api/auth/logout");
}

export async function getMe() {
  return api.get<{ user: MeUser }>("/api/auth/me");
}
