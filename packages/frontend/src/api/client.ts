export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Unable to connect to the server. Please try again.", 0);
  }

  let json: { success?: boolean; data?: T; error?: string };
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
    throw new ApiError(
      json.error || `Something went wrong (${res.status})`,
      res.status,
    );
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
