import { api } from "./client";

interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin" | "driver";
}

interface MeUser extends AuthUser {
  phone: string | null;
  createdAt: string;
}

export async function login(email: string, password?: string) {
  return api.post<{ user: AuthUser }>("/api/auth/login", { email, password });
}

export async function logout() {
  return api.post<{ message: string }>("/api/auth/logout");
}

export async function getMe() {
  return api.get<{ user: MeUser }>("/api/auth/me");
}
