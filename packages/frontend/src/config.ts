export const config = {
  // Dev default: http://localhost:3000 (backend runs here; CORS allows localhost:5173)
  // Prod: set VITE_API_BASE_URL in .env.production
  apiBase: (
    import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
  ).replace(/\/$/, ""),
} as const;
