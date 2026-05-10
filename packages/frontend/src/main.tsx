if (import.meta.env.DEV) {
  import("react-grab");
}

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./index.css";

import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { RealtimeProvider } from "./context/RealtimeContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import DriverGuard from "./components/DriverGuard";

import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvitation from "./pages/AcceptInvitation";
import BookingFlow from "./pages/BookingFlow";
import BookingHistory from "./pages/BookingHistory";
import CustomerRideDetail from "./pages/CustomerRideDetail";

import About from "./pages/About";
import RideTimeline from "./pages/admin/RideTimeline";
import DriverManagement from "./pages/admin/DriverManagement";
import CouponManagement from "./pages/admin/CouponManagement";
import LiveDriversMap from "./pages/admin/LiveDriversMap";
import IncidentInbox from "./pages/admin/IncidentInbox";
import VehicleManagement from "./pages/admin/VehicleManagement";

import MyRides from "./pages/driver/MyRides";
import DriverProfile from "./pages/driver/Profile";
import ProfilePage from "./pages/ProfilePage";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <RealtimeProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route
                  path="/accept-invitation"
                  element={<AcceptInvitation />}
                />
                <Route path="/" element={<BookingFlow />} />
                <Route path="/book" element={<BookingFlow />} />
                <Route path="/about" element={<About />} />

                {/* Customer */}
                <Route element={<ProtectedRoute roles={["customer"]} />}>
                  <Route path="/bookings" element={<BookingHistory />} />
                  <Route
                    path="/bookings/:id"
                    element={<CustomerRideDetail />}
                  />
                  <Route path="/profile" element={<ProfilePage />} />
                </Route>

                {/* Admin */}
                <Route element={<ProtectedRoute roles={["admin"]} />}>
                  <Route path="/admin" element={<RideTimeline />} />
                  <Route path="/admin/drivers" element={<DriverManagement />} />
                  <Route path="/admin/live-map" element={<LiveDriversMap />} />
                  <Route path="/admin/coupons" element={<CouponManagement />} />
                  <Route path="/admin/incidents" element={<IncidentInbox />} />
                  <Route path="/admin/vehicles" element={<VehicleManagement />} />
                  <Route path="/admin/profile" element={<ProfilePage />} />
                </Route>

                {/* Driver */}
                <Route element={<ProtectedRoute roles={["driver"]} />}>
                  <Route element={<DriverGuard />}>
                    <Route path="/driver" element={<MyRides />} />
                    <Route path="/driver/profile" element={<DriverProfile />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </RealtimeProvider>
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>,
);
