import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import * as authApi from "../api/auth";
import { setUnauthorizedHandler } from "../api/client";
import type { AuthUser, CheckEmailResponse } from "../api/auth";

// Cross-tab handshake channel name. The login modal in the booking flow
// listens here so a magic-link verification in another tab signs in this
// one too. Logout also broadcasts so all tabs sign out together.
const AUTH_CHANNEL = "auth";

type AuthChannelMessage = { type: "signed-in" } | { type: "signed-out" };

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  checkEmail: (email: string) => Promise<CheckEmailResponse>;
  login: (
    email: string,
    credential: { password?: string; phone?: string },
  ) => Promise<AuthUser>;
  register: (
    email: string,
    name: string,
    opts: { phone?: string; password?: string; termsAccepted: true },
  ) => Promise<AuthUser | { magicLinkSent: true }>;
  requestMagicLink: (email: string) => Promise<{ message: string }>;
  verifyMagicLink: (token: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  signOutLocally: () => void;
  setUserData: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const signOutLocally = useCallback(() => setUser(null), []);

  useEffect(() => {
    setUnauthorizedHandler(signOutLocally);
    return () => setUnauthorizedHandler(null);
  }, [signOutLocally]);

  // Refetch the current user from /auth/me. Used both at startup and
  // when another tab signals it just signed in.
  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.getMe();
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshUser().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  // Cross-tab auth sync via BroadcastChannel. Falls back gracefully on
  // browsers that don't support it.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(AUTH_CHANNEL);
    channelRef.current = bc;

    bc.onmessage = (e: MessageEvent<AuthChannelMessage>) => {
      const msg = e.data;
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "signed-in") {
        void refreshUser();
      } else if (msg.type === "signed-out") {
        signOutLocally();
      }
    };

    return () => {
      bc.close();
      channelRef.current = null;
    };
  }, [refreshUser, signOutLocally]);

  const broadcast = useCallback((msg: AuthChannelMessage) => {
    channelRef.current?.postMessage(msg);
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
      broadcast({ type: "signed-in" });
      return data.user;
    },
    [broadcast],
  );

  const register = useCallback(
    async (
      email: string,
      name: string,
      opts: { phone?: string; password?: string; termsAccepted: true },
    ) => {
      const data = await authApi.register(email, name, opts);
      if ("user" in data) {
        setUser(data.user);
        broadcast({ type: "signed-in" });
        return data.user;
      }
      return data;
    },
    [broadcast],
  );

  const requestMagicLink = useCallback(
    (email: string) => authApi.requestMagicLink(email),
    [],
  );

  const verifyMagicLink = useCallback(
    async (token: string) => {
      const data = await authApi.verifyMagicLink(token);
      setUser(data.user);
      broadcast({ type: "signed-in" });
      return data.user;
    },
    [broadcast],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    broadcast({ type: "signed-out" });
  }, [broadcast]);

  const setUserData = useCallback((u: AuthUser) => setUser(u), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        checkEmail,
        login,
        register,
        requestMagicLink,
        verifyMagicLink,
        logout,
        signOutLocally,
        setUserData,
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
