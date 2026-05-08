// Re-export the admin-relevant calls from their resource modules so existing
// imports keep working while the canonical location moves to per-resource files.
export { listDrivers } from "./drivers";
export { listCoupons, createCoupon } from "./coupons";
export {
  listBookings as listAllBookings,
  getBooking as getBookingDetail,
  updateBookingStatus,
  assignDrivers,
  triggerFallback,
  refundBooking,
} from "./bookings";
export type {
  PaymentRow,
  RefundRow,
  PaymentTrail,
  AdminRefundReason,
  RefundResult,
} from "./bookings";
