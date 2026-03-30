import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
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
        `flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
          isActive
            ? "text-blue-600 bg-blue-50"
            : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
        }`
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
        `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
          isActive
            ? "text-blue-700 bg-blue-50"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16 md:pb-0">
      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          {/* Brand */}
          <Link
            to="/"
            className="flex items-center gap-2 text-base font-bold text-blue-700"
          >
            <IconCar className="w-5 h-5" />
            <span className="hidden sm:inline">Taxi Concierge</span>
            <span className="sm:hidden">TC</span>
          </Link>

          {/* Desktop nav links */}
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
                <DesktopNavItem to="/admin/coupons" label="Coupons" />
              </>
            )}
            {user?.role === "driver" && (
              <DesktopNavItem to="/driver" label="My Rides" end />
            )}
          </div>

          {/* User actions */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden sm:block text-sm text-gray-500">
                  {user.name}
                </span>
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <IconLogout className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>

      {/* Mobile bottom nav — only shown when logged in */}
      {user && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40 safe-area-inset-bottom">
          <div className="flex items-center justify-around px-2 py-1">
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
