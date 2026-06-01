import { useStore } from "@nanostores/react";
import { $filters, $members, $pagination, $selectedMembers, $sort } from "../state/membersStore";

export function useMembers() {
  return {
    members: useStore($members),
    filters: useStore($filters),
    pagination: useStore($pagination),
    selectedMembers: useStore($selectedMembers),
    sort: useStore($sort),
  };
}
