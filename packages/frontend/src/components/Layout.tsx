import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-lg font-bold text-blue-700">
              Taxi Concierge
            </Link>
            {user?.role === "customer" && (
              <>
                <Link
                  to="/"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Book
                </Link>
                <Link
                  to="/bookings"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  My Bookings
                </Link>
              </>
            )}
            {user?.role === "admin" && (
              <>
                <Link
                  to="/admin"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Rides
                </Link>
                <Link
                  to="/admin/drivers"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Drivers
                </Link>
                <Link
                  to="/admin/coupons"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Coupons
                </Link>
              </>
            )}
            {user?.role === "driver" && (
              <Link
                to="/driver"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                My Rides
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-gray-500">{user.name}</span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
