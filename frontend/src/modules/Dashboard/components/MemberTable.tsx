import type { Member, SortState } from "../state/membersStore";
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  XCircle,
  Clock,
  Users,
  Edit,
  Tag,
  Play,
  UserMinus,
  ChevronDown,
  ChevronUp,
  FolderOpen
} from "lucide-react";

interface MemberTableProps {
  members: Member[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onSort: (field: SortState["field"]) => void;
  sort: SortState;
  onEdit: (member: Member) => void;
  onAddTag: (member: Member) => void;
  onCheck: (member: Member) => void;
  onResign: (member: Member) => void;
}

export function MemberTable({
  members,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onSort,
  sort,
  onEdit,
  onAddTag,
  onCheck,
  onResign,
}: MemberTableProps) {
  const getVerificationBadge = (status: string) => {
    const badges: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
      Verified: {
        color: "bg-emerald-50 text-emerald-700 border-emerald-250",
        label: "Verified",
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      },
      Partial: {
        color: "bg-amber-50 text-amber-700 border-amber-250",
        label: "Partial",
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
      },
      Captcha: {
        color: "bg-cyan-50 text-cyan-700 border-cyan-250",
        label: "Captcha",
        icon: <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />,
      },
      Fail: {
        color: "bg-rose-50 text-rose-700 border-rose-250",
        label: "Failed",
        icon: <XCircle className="w-3.5 h-3.5" />,
      },
      Unchecked: {
        color: "bg-slate-50 text-slate-700 border-slate-200",
        label: "Unchecked",
        icon: <Clock className="w-3.5 h-3.5" />,
      },
      Duplicate: {
        color: "bg-purple-50 text-purple-700 border-purple-250",
        label: "Duplicate",
        icon: <Users className="w-3.5 h-3.5" />,
      },
    };

    const badge = Object.prototype.hasOwnProperty.call(badges, status)
      ? badges[status]
      : badges.Unchecked;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${badge.color}`}
      >
        {badge.icon}
        <span>{badge.label}</span>
      </span>
    );
  };

  const getVerificationStatus = (member: Member): string => {
    if (!member.check_results || member.check_results.length === 0) {
      return "Unchecked";
    }
    const lastResult =
      member.check_results[member.check_results.length - 1].result;

    // Map backend results to frontend display names
    if (lastResult === "Pass") return "Verified";
    if (lastResult === "Partial") return "Partial";
    if (lastResult === "Captcha") return "Captcha";
    if (lastResult.startsWith("Fail")) return "Fail";
    if (member.is_duplicate) return "Duplicate";

    return lastResult;
  };

  const getSortIcon = (field: SortState["field"]) => {
    if (sort.field !== field) return <ChevronDown className="w-3 h-3 text-slate-400 inline-block ml-1" />;
    return sort.direction === "asc" ? (
      <ChevronUp className="w-3 h-3 text-primary inline-block ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 text-primary inline-block ml-1" />
    );
  };

  // Safety check for undefined members
  const safeMembers = members || [];

  return (
    <div className="bg-white overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <input
            type="checkbox"
            checked={
              safeMembers.length > 0 && selectedIds.size === safeMembers.length
            }
            onChange={onToggleSelectAll}
            className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
          />
          <h2 className="font-bold text-slate-900 text-base">
            Members Directory
          </h2>
        </div>
        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">
          Showing {safeMembers.length} member
          {safeMembers.length !== 1 ? "s" : ""}
          {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
            <tr>
              <th className="px-6 py-3.5 w-12"></th>
              <th
                className="px-6 py-3.5 cursor-pointer hover:text-indigo-650 transition-colors select-none"
                onClick={() => onSort("name")}
              >
                Name {getSortIcon("name")}
              </th>
              <th className="px-6 py-3.5">Address</th>
              <th
                className="px-6 py-3.5 cursor-pointer hover:text-indigo-650 transition-colors select-none"
                onClick={() => onSort("id")}
              >
                NB ID {getSortIcon("id")}
              </th>
              <th
                className="px-6 py-3.5 cursor-pointer hover:text-indigo-650 transition-colors select-none"
                onClick={() => onSort("status")}
              >
                Status {getSortIcon("status")}
              </th>
              <th className="px-6 py-3.5">Federal Electorate</th>
              <th className="px-6 py-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeMembers.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-12 text-center text-slate-400 font-medium"
                >
                  <FolderOpen className="w-10 h-10 text-slate-350 mx-auto mb-3" />
                  No members found
                </td>
              </tr>
            ) : (
              safeMembers.map((member) => (
                <tr
                  key={member.id}
                  className="hover:bg-slate-50/50 transition-colors group/row"
                >
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(member.id)}
                      onChange={() => onToggleSelect(member.id)}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900 text-sm">
                      {member.first_name}{" "}
                      {member.middle_name ? member.middle_name + " " : ""}
                      {member.last_name}
                    </div>
                    {member.email && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        {member.email}
                      </div>
                    )}
                    {member.mobile && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        {member.mobile}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <div className="text-slate-700 font-medium">
                      {member.primary_city || "-"}
                    </div>
                    <div className="text-slate-400 mt-0.5 font-medium">
                      {member.primary_state || "-"} {member.primary_zip || ""}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs text-slate-500 bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 rounded">
                      {member.nationbuilder_id || "-"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {getVerificationBadge(getVerificationStatus(member))}
                    {member.check_results?.at(-1)?.result && (
                      <div
                        className="text-[11px] text-slate-400 mt-1 font-semibold truncate max-w-[185px]"
                        title={member.check_results.at(-1)?.result}
                      >
                        {member.check_results.at(-1)?.result}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-650 font-medium">
                    {member.check_results?.at(-1)?.federal_division || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEdit(member)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-650 transition-colors"
                        title="Edit Details"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onAddTag(member)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-650 transition-colors"
                        title="Edit Tags"
                      >
                        <Tag className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onCheck(member)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-650 transition-colors"
                        title="Check AEC Details"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onResign(member)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-rose-655 transition-colors"
                        title="Remove Member"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
