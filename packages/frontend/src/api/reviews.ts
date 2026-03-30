import { api } from "./client";

export async function createReview(data: {
  bookingId: number;
  driverId: number;
  rating: number;
  comment?: string;
}) {
  return api.post("/api/reviews", data);
}
