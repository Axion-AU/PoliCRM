import { atom } from "nanostores";

export interface CheckResult {
  result: string;
  federal_division?: string;
  state_division?: string;
  local_government?: string;
  timestamp: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Member {
  id: number;
  nationbuilder_id: number;
  first_name: string;
  middle_name?: string;
  last_name: string; // Backend uses last_name, not surname
  email?: string;
  phone?: string;
  mobile?: string;
  primary_address1: string;
  primary_address2?: string;
  primary_city: string;
  primary_state: string;
  primary_zip: string;
  membership_status: string;
  is_duplicate: boolean;
  check_results: CheckResult[];
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface MemberFilters {
  search: string;
  status: string[];
  state: string;
  tags: string[];
  tagOperator: "AND" | "OR";
}

export interface PaginationState {
  page: number;
  itemsPerPage: number;
  totalItems: number;
}

export interface SortState {
  field: "name" | "id" | "status" | null;
  direction: "asc" | "desc";
}

// Member data
export const $members = atom<Member[]>([]);
export const $selectedMembers = atom<Set<number>>(new Set());
export const $loading = atom<boolean>(false);

// Filters
export const $filters = atom<MemberFilters>({
  search: "",
  status: [],
  state: "all",
  tags: [],
  tagOperator: "AND",
});

// Pagination
export const $pagination = atom<PaginationState>({
  page: 1,
  itemsPerPage: 20,
  totalItems: 0,
});

// Sorting
export const $sort = atom<SortState>({
  field: null,
  direction: "asc",
});

// Actions
export function setMembers(members: Member[]) {
  $members.set(members);
}

export function toggleMemberSelection(memberId: number) {
  const selected = new Set($selectedMembers.get());
  if (selected.has(memberId)) {
    selected.delete(memberId);
  } else {
    selected.add(memberId);
  }
  $selectedMembers.set(selected);
}

export function toggleSelectAll(memberIds: number[]) {
  const selected = $selectedMembers.get();
  if (selected.size === memberIds.length) {
    $selectedMembers.set(new Set());
  } else {
    $selectedMembers.set(new Set(memberIds));
  }
}

export function clearSelection() {
  $selectedMembers.set(new Set());
}

export function updateFilters(filters: Partial<MemberFilters>) {
  $filters.set({ ...$filters.get(), ...filters });
}

export function resetFilters() {
  $filters.set({
    search: "",
    status: [],
    state: "all",
    tags: [],
    tagOperator: "AND",
  });
}

export function updatePagination(pagination: Partial<PaginationState>) {
  $pagination.set({ ...$pagination.get(), ...pagination });
}

export function updateSort(field: SortState["field"]) {
  const current = $sort.get();
  if (current.field === field) {
    $sort.set({
      field,
      direction: current.direction === "asc" ? "desc" : "asc",
    });
  } else {
    $sort.set({ field, direction: "asc" });
  }
}
