import { API_BASE_URL } from "../../config";

let authTokenProvider: () => string | null = () => null;

const API_BASE = API_BASE_URL;

export function setAuthTokenProvider(provider: () => string | null) {
  authTokenProvider = provider;
}

export async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = authTokenProvider();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getAuthToken() {
  return authTokenProvider();
}
