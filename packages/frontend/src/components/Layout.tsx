import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../hooks/useNotifications";
import {
  IconCar,
  IconCalendar,
  IconUser,
  IconTicket,
  IconGrid,
  IconLogout,
  IconBell,
  IconMapPin,
} from "./icons";

/**
 * Brand: a dark monogram chip with a lime "TC" + a tightly-tracked wordmark.
 * The chip mirrors the P/D markers used in the route block (same dark square,
 * same Roboto Mono letterform), so the brand feels native to the product
 * rather than glued on top.
 */
function Brand() {
  return (
    <Link to="/" className="brand-link" aria-label="London Luton Taxi, home">
      <span className="brand-mark" aria-hidden="true">
        TC
      </span>
      <span className="brand-wordmark hidden sm:inline">London Luton Taxi</span>
    </Link>
  );
}

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

function profilePath(role: string) {
  if (role === "driver") return "/driver/profile";
  if (role === "admin") return "/admin/profile";
  return "/profile";
}

function UserChip({ name, role }: { name: string; role: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <Link to={profilePath(role)} className="user-chip" title={`${name}`}>
      <span className="user-chip-initial" aria-hidden="true">
        {initial}
      </span>
      <div className="user-chip-text">
        <div className="user-chip-name">{name}</div>
        {role !== "customer" && (
          <div className="user-chip-role">/ {role.toUpperCase()}</div>
        )}
      </div>
    </Link>
  );
}

function NotificationBell({ userId }: { userId: number }) {
  const {
    supported,
    permission,
    subscribed,
    loading,
    requestAndSubscribe,
    doUnsubscribe,
  } = useNotifications(userId);

  if (!supported) return null;

  const denied = permission === "denied";
  const title = denied
    ? "Notifications blocked — enable in browser settings"
    : subscribed
      ? "Notifications on — click to turn off"
      : "Enable push notifications";

  function handleClick() {
    if (denied || loading) return;
    if (subscribed) doUnsubscribe();
    else requestAndSubscribe();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || denied}
      title={title}
      aria-label={title}
      className={`topbar-icon-btn relative${denied ? " opacity-40" : ""}`}
    >
      <IconBell className="h-4 w-4" filled={subscribed} />
      {subscribed && (
        <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[var(--color-forest)]" />
      )}
    </button>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const isImmersivePage =
    path === "/" || path === "/book" || /^\/bookings\/\d+$/.test(path);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className={`app-shell ${isImmersivePage ? "" : "pb-16 md:pb-0"}`}>
      <nav className="app-topbar">
        <div className="mx-auto flex h-[72px] w-full max-w-[1280px] items-center justify-between gap-4 px-5">
          <Brand />

          <div className="hidden md:flex items-center gap-1">
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
                <DesktopNavItem to="/admin/live-map" label="Live map" />
                <DesktopNavItem to="/admin/incidents" label="Incidents" />
                <DesktopNavItem to="/admin/coupons" label="Coupons" />
              </>
            )}
            {user?.role === "driver" && (
              <DesktopNavItem to="/driver" label="My Rides" end />
            )}
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <div className="hidden sm:block">
                  <UserChip name={user.name} role={user.role} />
                </div>
                <NotificationBell userId={user.id} />
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  aria-label="Sign out"
                  className="topbar-icon-btn"
                >
                  <IconLogout className="h-4 w-4" />
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-primary button-text-compact">
                <span>Sign in</span>
                <span className="btn-icon">
                  <span className="btn-icon-glyph">↗</span>
                </span>
              </Link>
            )}
          </div>
        </div>
      </nav>

      <main className={isImmersivePage ? "" : "app-main"}>
        <Outlet />
      </main>

      {user && !isImmersivePage && (
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
                <NavItem
                  to="/profile"
                  icon={<IconUser className="w-5 h-5" />}
                  label="Account"
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
                  to="/admin/live-map"
                  icon={<IconMapPin className="w-5 h-5" />}
                  label="Live"
                />
                <NavItem
                  to="/admin/incidents"
                  icon={<IconTicket className="w-5 h-5" />}
                  label="SOS"
                />
                <NavItem
                  to="/admin/coupons"
                  icon={<IconTicket className="w-5 h-5" />}
                  label="Coupons"
                />
              </>
            )}
            {user.role === "driver" && (
              <>
                <NavItem
                  to="/driver"
                  icon={<IconCar className="w-5 h-5" />}
                  label="My Rides"
                />
                <NavItem
                  to="/driver/profile"
                  icon={<IconUser className="w-5 h-5" />}
                  label="Profile"
                />
              </>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
