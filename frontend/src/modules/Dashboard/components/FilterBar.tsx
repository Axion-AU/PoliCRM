import { useState } from "react";
import { useStore } from "@nanostores/react";
import { $tags } from "../state/tagsStore";
import type { MemberFilters } from "../state/membersStore";
import {
  Search,
  ChevronDown,
  Tag,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Users,
  X
} from "lucide-react";

interface FilterBarProps {
  filters: MemberFilters;
  onFiltersChange: (filters: Partial<MemberFilters>) => void;
  onClearFilters: () => void;
}

export function FilterBar({
  filters,
  onFiltersChange,
  onClearFilters,
}: FilterBarProps) {
  const tags = useStore($tags);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);

  const statusOptions = [
    { value: "Verified", label: "Verified", icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
    { value: "Partial", label: "Partial Match", icon: <AlertTriangle className="w-4 h-4 text-amber-500" /> },
    { value: "Captcha", label: "Captcha", icon: <RefreshCw className="w-4 h-4 text-cyan-500" /> },
    { value: "Fail", label: "Failed", icon: <XCircle className="w-4 h-4 text-rose-500" /> },
    { value: "Unchecked", label: "Unchecked", icon: <Clock className="w-4 h-4 text-slate-400" /> },
    { value: "Duplicate", label: "Duplicate", icon: <Users className="w-4 h-4 text-purple-500" /> },
  ];

  const states = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

  const toggleStatusFilter = (status: string) => {
    const currentStatus = filters.status || [];
    const newStatus = currentStatus.includes(status)
      ? currentStatus.filter((s) => s !== status)
      : [...currentStatus, status];
    onFiltersChange({ status: newStatus });
  };

  const toggleTagFilter = (tagId: string) => {
    const currentTags = filters.tags || [];
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId];
    onFiltersChange({ tags: newTags });
  };

  const setStatusPreset = (preset: "action_required" | "safe") => {
    if (preset === "action_required") {
      onFiltersChange({ status: ["Captcha", "Fail", "Unchecked"] });
    } else {
      onFiltersChange({ status: ["Verified"] });
    }
    setStatusDropdownOpen(false);
  };

  const getStatusFilterLabel = () => {
    if (!filters.status || filters.status.length === 0) return "All Statuses";
    if (filters.status.length === 1) {
      const match = statusOptions.find((s) => s.value === filters.status[0]);
      return match ? match.label : "All Statuses";
    }
    return `${filters.status.length} selected`;
  };

  return (
    <div className="p-6 border-b border-slate-150 bg-white">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-grow">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
            Search Members
          </label>
          <div className="relative">
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onFiltersChange({ search: e.target.value })}
              placeholder="Search by name, NB ID, suburb, or electorate..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm placeholder:text-slate-400"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          </div>
        </div>

        {/* Status Filter */}
        <div className="w-full lg:w-48 relative">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
            Status
          </label>
          <button
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            className="w-full text-left px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white flex justify-between items-center text-sm"
          >
            <span className="truncate">{getStatusFilterLabel()}</span>
            <ChevronDown className="w-4 h-4 text-slate-400 transition-transform" />
          </button>

          {statusDropdownOpen && (
            <div className="absolute top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-30">
              {/* Presets */}
              <div className="mb-3 pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase block mb-2">
                  Presets
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setStatusPreset("action_required")}
                    className="px-2.5 py-1 text-xs bg-orange-50 text-orange-700 rounded border border-orange-100 hover:bg-orange-100 font-medium"
                  >
                    Action Required
                  </button>
                  <button
                    onClick={() => setStatusPreset("safe")}
                    className="px-2.5 py-1 text-xs bg-emerald-50 text-emerald-700 rounded border border-emerald-100 hover:bg-emerald-100 font-medium"
                  >
                    Safe
                  </button>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {statusOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={filters.status?.includes(option.value) || false}
                      onChange={() => toggleStatusFilter(option.value)}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                      {option.icon}
                      <span>{option.label}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-150 flex justify-end">
                <button
                  onClick={() => onFiltersChange({ status: [] })}
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* State Filter */}
        <div className="w-full lg:w-48">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
            State
          </label>
          <select
            value={filters.state}
            onChange={(e) => onFiltersChange({ state: e.target.value })}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-sm"
          >
            <option value="all">All States</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </div>

        {/* Tag Filter */}
        <div className="w-full lg:w-48 relative">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
            Tags
          </label>
          <button
            onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary bg-white text-sm flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-slate-400" />
              <span>Tags</span>
            </div>
            {filters.tags && filters.tags.length > 0 ? (
              <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold border border-indigo-200">
                {filters.tags.length}
              </span>
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform" />
            )}
          </button>

          {tagDropdownOpen && (
            <div className="absolute top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-20">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase">
                  Filter by Tags
                </span>
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
                  <button
                    onClick={() => onFiltersChange({ tagOperator: "AND" })}
                    className={`px-2 py-0.5 text-xs font-bold rounded transition-all ${
                      filters.tagOperator === "AND"
                        ? "bg-white shadow-sm text-indigo-600"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    AND
                  </button>
                  <button
                    onClick={() => onFiltersChange({ tagOperator: "OR" })}
                    className={`px-2 py-0.5 text-xs font-bold rounded transition-all ${
                      filters.tagOperator === "OR"
                        ? "bg-white shadow-sm text-indigo-600"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    OR
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                {tags.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    No tags available
                  </p>
                ) : (
                  tags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={
                          filters.tags?.includes(String(tag.id)) || false
                        }
                        onChange={() => toggleTagFilter(String(tag.id))}
                        className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                      />
                      <span
                        className="w-3 h-3 rounded-full border border-black/10"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm text-slate-700 font-medium">{tag.name}</span>
                    </label>
                  ))
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => onFiltersChange({ tags: [] })}
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clear Filters Button */}
        <div className="flex items-end">
          <button
            onClick={onClearFilters}
            className="w-full lg:w-auto px-4 py-2.5 text-slate-600 hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors font-medium text-sm whitespace-nowrap flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4 text-slate-400" />
            <span>Clear Filters</span>
          </button>
        </div>
      </div>
    </div>
  );
}
