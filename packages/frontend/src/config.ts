export const config = {
  // Dev default: http://localhost:3000 (backend runs here; CORS allows localhost:5173)
  // Prod: set VITE_API_BASE_URL in .env.production
  apiBase: (
    import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
  ).replace(/\/$/, ""),

  // OSRM host for both planned-route lookups (`/route/v1/...`) and the
  // breadcrumb map-matching service (`/match/v1/...`). Defaults to the
  // public demo, which is fine for development; swap to a self-hosted
  // or paid-tier endpoint via VITE_OSRM_URL in prod. See
  // docs/breadcrumb-and-osrm.md for context.
  osrmUrl: (
    import.meta.env.VITE_OSRM_URL || "https://router.project-osrm.org"
  ).replace(/\/$/, ""),
} as const;
