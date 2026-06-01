import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { useNavigate } from "react-router-dom";
import {
  $filters,
  $pagination,
  $sort,
  $selectedMembers,
  updateFilters,
  updatePagination,
  updateSort,
  toggleMemberSelection,
  toggleSelectAll,
  clearSelection,
  type Member,
} from "../state/membersStore";
import { membersApi } from "../api/dashboardApi";
import { QuickActions } from "../components/QuickActions";
import { FilterBar } from "../components/FilterBar";
import { MemberTable } from "../components/MemberTable";
import { Pagination } from "../components/Pagination";
import { signOut } from "@modules/Auth";
import { FolderOpen, Plus } from "lucide-react";

export default function Dashboard() {
  const navigate = useNavigate();
  const filters = useStore($filters);
  const pagination = useStore($pagination);
  const sort = useStore($sort);
  const selectedIds = useStore($selectedMembers);

  const [members, setMembers] = useState<Member[]>([]);
  const [refreshTimer, setRefreshTimer] = useState("10s");
  const [, setRefreshIntervalState] = useState<number | null>(null);

  // Modals state
  const [, setShowAddMember] = useState(false);
  const [, setShowEditMember] = useState(false);
  const [, setShowImportCSV] = useState(false);
  const [, setShowExportWizard] = useState(false);
  const [, setShowBulkStatus] = useState(false);
  const [, setShowResignModal] = useState(false);
  const [, setShowReminders] = useState(false);

  const [, setSelectedMember] = useState<Member | null>(null);

  // Fetch members with filters
  const fetchMembers = async () => {
    try {
      const params = {
        search: filters.search || undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        state: filters.state !== "all" ? filters.state : undefined,
        tags: filters.tags.length > 0 ? filters.tags.map(Number) : undefined,
        tag_operator: filters.tagOperator,
        skip: (pagination.page - 1) * pagination.itemsPerPage,
        limit: pagination.itemsPerPage,
        sort_by: sort.field || undefined,
        sort_order: sort.direction,
      };

      // Backend returns array directly, not wrapped in { members: [...] }
      const members = await membersApi.getAll(params);
      setMembers(members);
    } catch (error) {
      console.error("Failed to fetch members:", error);
      setMembers([]);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchMembers();
  }, []);

  // Refetch when filters/pagination/sort change
  useEffect(() => {
    fetchMembers();
  }, [filters, pagination.page, pagination.itemsPerPage, sort]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMembers();
    }, 10000);
    setRefreshIntervalState(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [filters, pagination, sort]);

  // Timer countdown for display
  useEffect(() => {
    let countdown = 10;
    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) countdown = 10;
      setRefreshTimer(`${countdown} s`);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Handlers
  const handleCheckSelected = async () => {
    const ids = Array.from(selectedIds).map(Number);
    if (ids.length === 0) return;

    try {
      await membersApi.checkSelected(ids);
      clearSelection();
      fetchMembers();
    } catch (error) {
      console.error("Failed to check selected:", error);
      alert("Failed to initiate check. Please try again.");
    }
  };

  const handleRetryCaptchas = async () => {
    const captchaMembers = members.filter((m) => {
      const lastResult = m.check_results?.at(-1)?.result;
      return lastResult === "Captcha";
    });

    if (captchaMembers.length === 0) {
      alert("No members with CAPTCHA status found.");
      return;
    }

    const confirmRetry = window.confirm(
      `Retry ${captchaMembers.length} member(s) with CAPTCHA status ? `,
    );
    if (confirmRetry) {
      try {
        for (const member of captchaMembers) {
          await membersApi.checkSelected([member.id]);
        }
        fetchMembers();
      } catch (error) {
        console.error("Failed to retry captchas:", error);
        alert("Failed to retry CAPTCHA checks.");
      }
    }
  };

  const handleExportSelected = () => {
    setShowExportWizard(true);
  };

  const handleExportAll = () => {
    membersApi.exportCSV({});
  };

  const handleBulkActions = () => {
    setShowBulkStatus(true);
  };

  const handleReminders = () => {
    setShowReminders(true);
  };

  const handleClearFilters = () => {
    updateFilters({
      search: "",
      status: [],
      state: "all",
      tags: [],
      tagOperator: "AND",
    });
  };

  const handleEdit = (member: Member) => {
    setSelectedMember(member);
    setShowEditMember(true);
  };

  const handleAddTag = (member: Member) => {
    setSelectedMember(member);
    // Open tag modal - we'll implement this in the modal component
  };

  const handleCheck = async (member: Member) => {
    try {
      await membersApi.checkSelected([member.id]);
      fetchMembers();
    } catch (error) {
      console.error("Failed to check member:", error);
      alert("Failed to check member. Please try again.");
    }
  };

  const handleResign = (member: Member) => {
    setSelectedMember(member);
    setShowResignModal(true);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const totalPages = Math.ceil(pagination.totalItems / pagination.itemsPerPage);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Registry Workspace</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-250">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  AEC Worker Active
                </span>
              </div>
              <p className="text-slate-500 mt-0.5 text-xs font-semibold uppercase tracking-wider">
                Overview of member enrollment verification
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowImportCSV(true)}
                className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg transition-all font-semibold text-sm border border-slate-300 flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4 text-slate-500" />
                <span>Import CSV</span>
              </button>
              <button
                onClick={() => setShowAddMember(true)}
                className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm transition-all font-semibold text-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
              <button
                onClick={handleSignOut}
                className="hover:bg-slate-100 text-slate-500 hover:text-slate-900 px-4 py-2 rounded-lg transition-all font-medium text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          {/* Filter Bar (Upper Deck) */}
          <FilterBar
            filters={filters}
            onFiltersChange={(newFilters) => updateFilters(newFilters)}
            onClearFilters={handleClearFilters}
          />

          {/* Quick Actions (Middle Deck) */}
          <QuickActions
            selectedCount={selectedIds.size}
            onCheckSelected={handleCheckSelected}
            onRetryCaptchas={handleRetryCaptchas}
            onExport={handleExportSelected}
            onExportAll={handleExportAll}
            onBulkActions={handleBulkActions}
            onReminders={handleReminders}
            refreshTimer={refreshTimer}
          />

          {/* Member Directory Table (Core Section) */}
          <MemberTable
            members={members}
            selectedIds={selectedIds}
            onToggleSelect={(id) => toggleMemberSelection(id)}
            onToggleSelectAll={() => toggleSelectAll(members.map((m) => m.id))}
            onSort={(field) => updateSort(field)}
            sort={sort}
            onEdit={handleEdit}
            onAddTag={handleAddTag}
            onCheck={handleCheck}
            onResign={handleResign}
          />

          {/* Pagination (Lower Deck) */}
          <Pagination
            currentPage={pagination.page}
            totalPages={totalPages}
            itemsPerPage={pagination.itemsPerPage}
            onPageChange={(page) => updatePagination({ page })}
            onItemsPerPageChange={(itemsPerPage) =>
              updatePagination({ itemsPerPage, page: 1 })
            }
          />
        </div>
      </div>

      {/* Modals will be added here */}
      {/* {showAddMember && <AddMemberModal ... />} */}
      {/* {showEditMember && <EditMemberModal ... />} */}
      {/* etc. */}
    </div>
  );
}
