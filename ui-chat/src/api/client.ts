import { stackApp } from "@/auth/stack-client";

const BASE_URL = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

async function getAccessToken(): Promise<string | null> {
  const user = await stackApp.getUser();
  if (!user) return null;
  const authJson = await user.getAuthJson();
  return authJson?.accessToken ?? null;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { headers?: Record<string, string>; raw?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    ...options?.headers,
  };

  const token = await getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, res.statusText, errBody);
  }

  if (options?.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const client = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return request<T>("GET", path, undefined, { headers });
  },

  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return request<T>("POST", path, body, { headers });
  },

  patch<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return request<T>("PATCH", path, body, { headers });
  },

  delete<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return request<T>("DELETE", path, body, { headers });
  },

  raw(method: string, path: string, body?: unknown): Promise<Response> {
    return request<Response>(method, path, body, { raw: true });
  },
};
