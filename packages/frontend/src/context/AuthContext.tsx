import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import * as authApi from "../api/auth";
import { setUnauthorizedHandler } from "../api/client";
import type { AuthUser, CheckEmailResponse } from "../api/auth";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  checkEmail: (email: string) => Promise<CheckEmailResponse>;
  login: (
    email: string,
    credential: { password?: string; phone?: string },
  ) => Promise<AuthUser>;
  register: (email: string, name: string, phone: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  signOutLocally: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const signOutLocally = useCallback(() => setUser(null), []);

  useEffect(() => {
    setUnauthorizedHandler(signOutLocally);
    return () => setUnauthorizedHandler(null);
  }, [signOutLocally]);

  useEffect(() => {
    let cancelled = false;
    authApi
      .getMe()
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const checkEmail = useCallback(
    (email: string) => authApi.checkEmail(email),
    [],
  );

  const login = useCallback(
    async (
      email: string,
      credential: { password?: string; phone?: string },
    ) => {
      const data = await authApi.login(email, credential);
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const register = useCallback(
    async (email: string, name: string, phone: string) => {
      const data = await authApi.register(email, name, phone);
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        checkEmail,
        login,
        register,
        logout,
        signOutLocally,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
