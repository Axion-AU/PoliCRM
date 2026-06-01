import { apiCall } from "@shared/infrastructure/httpClient";
import type { DashboardStats } from "../state/statsStore";
import type { Member } from "../state/membersStore";

export const membersApi = {
  getAll: async (params?: {
    search?: string;
    status?: string[];
    state?: string;
    tags?: number[];
    tag_operator?: "AND" | "OR";
    skip?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          if (Array.isArray(value)) {
            value.forEach((v) => queryParams.append(key, String(v)));
          } else {
            queryParams.append(key, String(value));
          }
        }
      });
    }

    return apiCall<Member[]>(`/members?${queryParams}`);
  },

  getById: (id: number) => apiCall<Member>(`/members/${id}`),

  create: (data: unknown) =>
    apiCall<unknown>("/members", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: number, data: unknown) =>
    apiCall<unknown>(`/members/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    apiCall<void>(`/members/${id}`, {
      method: "DELETE",
    }),

  checkSelected: (ids: number[]) =>
    apiCall<unknown>("/members/check-selected", {
      method: "POST",
      body: JSON.stringify({ member_ids: ids }),
    }),

  bulkUpdateStatus: (ids: number[], status: string) =>
    apiCall<unknown>("/members/bulk-update-status", {
      method: "POST",
      body: JSON.stringify({ member_ids: ids, status }),
    }),

  resign: (id: number) =>
    apiCall<unknown>(`/members/${id}/resign`, {
      method: "POST",
    }),

  exportCSV: (params: Record<string, string>) => {
    const queryParams = new URLSearchParams(params);
    window.location.href = `/members/export?${queryParams}`;
  },
};

export const tagsApi = {
  getAll: () => apiCall<unknown[]>("/tags"),
};

export const statsApi = {
  getDashboard: () => apiCall<DashboardStats[]>("/stats/dashboard"),
  getByState: () => apiCall<DashboardStats[]>("/stats/by-state"),
  getByElectorate: () => apiCall<DashboardStats[]>("/stats/by-electorate"),
};
