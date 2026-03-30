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

import RideTimeline from "./pages/admin/RideTimeline";
import DriverManagement from "./pages/admin/DriverManagement";
import CouponManagement from "./pages/admin/CouponManagement";

import MyRides from "./pages/driver/MyRides";

// Register service worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
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
