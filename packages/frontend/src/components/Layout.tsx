import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  IconCar,
  IconCalendar,
  IconUser,
  IconTicket,
  IconGrid,
  IconLogout,
} from "./icons";

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
  const navigate = useNavigate();
  const location = useLocation();
  const isLandingPage = location.pathname === "/";

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

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
