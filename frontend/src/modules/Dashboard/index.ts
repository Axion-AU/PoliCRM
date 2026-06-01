export { default as DashboardPage } from "./pages/DashboardPage";
export { membersApi, statsApi, tagsApi } from "./api/dashboardApi";
export { $stats, fetchStats } from "./state/statsStore";
export { updateFilters } from "./state/membersStore";
export { useMembers } from "./hooks/useMembers";
export type { Member, MemberFilters, PaginationState, SortState, Tag } from "./state/membersStore";

export function resetDashboardFilters() {
  updateFilters({
    search: "",
    status: [],
    state: "all",
    tags: [],
    tagOperator: "AND",
  });
}
