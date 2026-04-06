import { useEffect, useRef } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  getNotificationPublicKey,
  subscribeNotifications,
} from "../api/notifications";
import {
  IconCar,
  IconCalendar,
  IconUser,
  IconTicket,
  IconMapPin,
  IconGrid,
  IconLogout,
} from "./icons";

const ALERTS_AUTO_PROMPT_KEY = "taxi-alerts-auto-prompted-v1";

function NavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/" || to === "/admin" || to === "/driver"}
      className={({ isActive }) =>
        `mobile-nav-link ${isActive ? "mobile-nav-link-active" : ""}`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function DesktopNavItem({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `nav-link ${isActive ? "nav-link-active" : ""}`
      }
    >
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isLandingPage = location.pathname === "/";
  const autoPromptBoundRef = useRef(false);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  async function enableNotifications(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        if (!silent) {
          toast.error("Notifications are not supported on this device");
        }
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        if (!silent) {
          toast.error("Notification permission was not granted");
        }
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        let vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as
          | string
          | undefined;

        if (!vapidPublicKey) {
          const config = await getNotificationPublicKey().catch(() => null);
          vapidPublicKey = config?.publicKey;
        }

        if (!vapidPublicKey) {
          if (!silent) {
            toast.error("Push setup missing (VAPID key not configured)");
          }
          return;
        }

        const applicationServerKey = Uint8Array.from(
          atob(
            vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(
              Math.ceil(vapidPublicKey.length / 4) * 4,
              "=",
            ),
          ),
          (char) => char.charCodeAt(0),
        );

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const payload = subscription.toJSON();
      const p256dh = payload.keys?.p256dh;
      const auth = payload.keys?.auth;
      if (!payload.endpoint || !p256dh || !auth) {
        if (!silent) {
          toast.error("Failed to read push subscription keys");
        }
        return;
      }

      await subscribeNotifications({
        endpoint: payload.endpoint,
        p256dh,
        auth,
      });
      if (!silent) {
        toast.success("Notifications enabled");
      }
    } catch {
      if (!silent) {
        toast.error("Failed to enable notifications");
      }
    }
  }

  async function handleEnableNotifications() {
    await enableNotifications({ silent: false });
  }

  useEffect(() => {
    if (!user) return;
    if (autoPromptBoundRef.current) return;
    autoPromptBoundRef.current = true;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (window.localStorage.getItem(ALERTS_AUTO_PROMPT_KEY) === "1") return;

    const onFirstInteraction = () => {
      window.localStorage.setItem(ALERTS_AUTO_PROMPT_KEY, "1");
      void enableNotifications({ silent: true });
    };

    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
    };
  }, [user]);

  return (
    <div className={`app-shell ${isLandingPage ? "" : "pb-16 md:pb-0"}`}>
      <nav className="app-topbar">
        <div className="mx-auto flex h-[72px] w-full max-w-[1280px] items-center justify-between gap-4 px-5">
          <Link to="/" className="app-brand">
            <span className="btn-icon">
              <IconCar className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">Taxi Concierge</span>
            <span className="sm:hidden">TC</span>
          </Link>

          <div className="hidden md:flex items-center gap-2">
            {user?.role === "customer" && (
              <>
                <DesktopNavItem to="/" label="Book" end />
                <DesktopNavItem to="/bookings" label="My Bookings" />
              </>
            )}
            {user?.role === "admin" && (
              <>
                <DesktopNavItem to="/admin" label="Rides" end />
                <DesktopNavItem to="/admin/drivers" label="Drivers" />
                <DesktopNavItem to="/admin/coupons" label="Coupons" />
                <DesktopNavItem to="/admin/routes" label="Routes" />
              </>
            )}
            {user?.role === "driver" && (
              <DesktopNavItem to="/driver" label="My Rides" end />
            )}
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <div className="hidden sm:block text-right">
                  <div className="page-eyebrow">Signed In</div>
                  <div className="text-sm font-medium text-[var(--color-dark)]">
                    {user.name}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="btn-ghost"
                >
                  <IconLogout className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
                <button
                  onClick={handleEnableNotifications}
                  title="Enable notifications"
                  className="btn-secondary button-text-compact hidden sm:inline-flex"
                >
                  Alerts
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-primary button-text-compact">
                <span>Login</span>
                <span className="btn-icon">
                  <span className="btn-icon-glyph">↗</span>
                </span>
              </Link>
            )}
          </div>
        </div>
      </nav>

      <main className={isLandingPage ? "" : "app-main"}>
        <Outlet />
      </main>

      {user && !isLandingPage && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[rgb(249_249_249_/_0.96)] backdrop-blur md:hidden safe-area-inset-bottom">
          <div className="flex items-center justify-around px-2 py-2">
            {user.role === "customer" && (
              <>
                <NavItem
                  to="/"
                  icon={<IconCar className="w-5 h-5" />}
                  label="Book"
                />
                <NavItem
                  to="/bookings"
                  icon={<IconCalendar className="w-5 h-5" />}
                  label="Bookings"
                />
              </>
            )}
            {user.role === "admin" && (
              <>
                <NavItem
                  to="/admin"
                  icon={<IconGrid className="w-5 h-5" />}
                  label="Rides"
                />
                <NavItem
                  to="/admin/drivers"
                  icon={<IconUser className="w-5 h-5" />}
                  label="Drivers"
                />
                <NavItem
                  to="/admin/coupons"
                  icon={<IconTicket className="w-5 h-5" />}
                  label="Coupons"
                />
                <NavItem
                  to="/admin/routes"
                  icon={<IconMapPin className="w-5 h-5" />}
                  label="Routes"
                />
              </>
            )}
            {user.role === "driver" && (
              <NavItem
                to="/driver"
                icon={<IconCar className="w-5 h-5" />}
                label="My Rides"
              />
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
