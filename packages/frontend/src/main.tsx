import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import BookingFlow from "./pages/BookingFlow";
import BookingHistory from "./pages/BookingHistory";

// Admin — placeholders until Phase 1d
function RideTimeline() {
  return <h1 className="text-xl font-semibold">Admin: Ride Timeline</h1>;
}
function DriverManagement() {
  return <h1 className="text-xl font-semibold">Admin: Drivers</h1>;
}
function CouponManagement() {
  return <h1 className="text-xl font-semibold">Admin: Coupons</h1>;
}

// Driver — placeholder until Phase 1e
function MyRides() {
  return <h1 className="text-xl font-semibold">Driver: My Rides</h1>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<BookingFlow />} />

            {/* Customer — requires login */}
            <Route element={<ProtectedRoute roles={["customer"]} />}>
              <Route path="/bookings" element={<BookingHistory />} />
            </Route>

            {/* Admin */}
            <Route element={<ProtectedRoute roles={["admin"]} />}>
              <Route path="/admin" element={<RideTimeline />} />
              <Route path="/admin/drivers" element={<DriverManagement />} />
              <Route path="/admin/coupons" element={<CouponManagement />} />
            </Route>

            {/* Driver */}
            <Route element={<ProtectedRoute roles={["driver"]} />}>
              <Route path="/driver" element={<MyRides />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
