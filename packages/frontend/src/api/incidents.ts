import { api } from "./client";

export interface AdminIncident {
  id: number;
  bookingId: number;
  reporterId: number;
  type: "emergency" | "contact_admin";
  message: string | null;
  resolved: boolean;
  createdAt: string;
  reporterName: string;
  reporterPhone: string | null;
}

export function listIncidents() {
  return api.get<{ incidents: AdminIncident[] }>("/admin/incidents");
}

export function resolveIncident(id: number) {
  return api.patch<{ incident: AdminIncident }>(
    `/admin/incidents/${id}/resolve`,
  );
}
