import { config } from "../config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const API_BASE = config.apiBase;
const BASE = API_BASE;

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Unable to connect to the server. Please try again.", 0);
  }

  let json: { success?: boolean; data?: T; error?: string; details?: unknown };
  try {
    json = await res.json();
  } catch {
    throw new ApiError(
      res.ok
        ? "Unexpected response from server"
        : `Server error (${res.status})`,
      res.status,
    );
  }

  if (!res.ok || !json.success) {
    if (
      res.status === 401 &&
      unauthorizedHandler &&
      !path.startsWith("/auth/")
    ) {
      unauthorizedHandler();
    }
    throw new ApiError(
      json.error || `Something went wrong (${res.status})`,
      res.status,
      json.details,
    );
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
