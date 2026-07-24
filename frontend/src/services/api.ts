/**
 * PoliCRM API Client
 *
 * Backend port is dynamic (8080–8100). Set VITE_API_BASE_URL in your .env to
 * point at the correct port. Defaults to http://localhost:8080.
 *
 * Example .env entry:
 *   VITE_API_BASE_URL=http://localhost:8080
 */

function validateApiBase(candidate?: string): string {
  const raw = candidate ?? "http://localhost:8080";
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error(`Insecure HTTP API base URL is only allowed for localhost, got: ${raw}`);
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Invalid VITE_API_BASE_URL: "${raw}" is not a valid URL`);
    }
    throw err;
  }
  return raw;
}

const API_BASE = validateApiBase(import.meta.env.VITE_API_BASE_URL as string | undefined);

/* ─── Types ──────────────────────────────────────────────────────────────── */
export interface ApiError extends Error {
  status: number;
}

export interface Person {
  id: string;
  given_name: string;
  surname: string;
  email?: string; // encrypted at rest — may be absent
  primary_state?: string;
  primary_zip?: string;
  membership_status?: string;
  created_at: string;
  updated_at: string;
}

export interface PersonsPage {
  data: Person[];
  next_cursor?: string;
  total?: number;
}

export interface ImportJob {
  id: string;
  source: "csv" | "nationbuilder";
  status: "pending" | "running" | "complete" | "failed";
  records_total?: number;
  records_processed?: number;
  records_skipped?: number;
  filename?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

/* ─── Core fetch wrapper ─────────────────────────────────────────────────── */
async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message ?? body?.error ?? message;
    } catch {
      // ignore JSON parse errors
    }
    const err = Object.assign(new Error(message), { status: res.status });
    throw err;
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

/* ─── Persons API ────────────────────────────────────────────────────────── */
export const personsApi = {
  list(params?: {
    cursor?: string;
    state?: string;
    limit?: number;
    search?: string;
  }): Promise<PersonsPage> {
    const q = new URLSearchParams();
    if (params?.cursor) q.set("cursor", params.cursor);
    if (params?.state) q.set("state", params.state);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return request<PersonsPage>(`/persons${qs ? `?${qs}` : ""}`);
  },

  get(id: string): Promise<Person> {
    return request<Person>(`/persons/${encodeURIComponent(id)}`);
  },
};

/* ─── Import / Jobs API ──────────────────────────────────────────────────── */
export const importApi = {
  list(): Promise<ImportJob[]> {
    return request<ImportJob[]>("/import/jobs");
  },

  get(id: string): Promise<ImportJob> {
    return request<ImportJob>(`/import/jobs/${encodeURIComponent(id)}`);
  },

  uploadCsv(file: File): Promise<ImportJob> {
    const form = new FormData();
    form.append("file", file);
    return request<ImportJob>("/import/csv", {
      method: "POST",
      body: form,
      headers: {}, // Let browser set multipart boundary
    });
  },

  startNationBuilder(params: { api_key: string; slug: string }): Promise<ImportJob> {
    return request<ImportJob>("/import/nationbuilder", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },
};

/* ─── Analytics API ─────────────────────────────────────────────────────── */
export const analyticsApi = {
  electorateCounts(): Promise<{
    verified: Record<string, number>;
    projected: Record<string, number>;
    metadata?: { verified_max: number; projected_max: number };
  }> {
    return request("/analytics/electorate-counts");
  },

  growth(): Promise<Record<string, number>> {
    return request("/analytics/growth");
  },

  geographic(): Promise<{
    by_state: Record<string, number>;
    by_division: Record<string, number>;
  }> {
    return request("/analytics/geographic");
  },

  summary(): Promise<{
    total_persons: number;
    states_covered: number;
    imports_total: number;
    last_import_at?: string;
  }> {
    return request("/analytics/summary");
  },
};

/* ─── Stats API ─────────────────────────────────────────────────────────── */
export interface StatsDashboard {
  total_members: number;
  active_members: number;
  lapsed_members: number;
  verified_count: number;
  failed_count: number;
  partial_match_count: number;
  captcha_count: number;
  unchecked_count: number;
  duplicate_count: number;
  new_members_30d: number;
  by_state: Record<string, number>;
}

export interface ElectorateStat {
  federal_division: string;
  count: number;
}

export const statsApi = {
  dashboard(): Promise<StatsDashboard> {
    return request<StatsDashboard>("/stats/dashboard");
  },
  electorates(): Promise<ElectorateStat[]> {
    return request<ElectorateStat[]>("/stats/electorates");
  },
};
