import { Search, RefreshCw, Download, Layers, Calendar } from "lucide-react";

interface QuickActionsProps {
  selectedCount: number;
  onCheckSelected: () => void;
  onRetryCaptchas: () => void;
  onExport: () => void;
  onExportAll: () => void;
  onBulkActions: () => void;
  onReminders: () => void;
  refreshTimer: string;
}

export function QuickActions({
  selectedCount,
  onCheckSelected,
  onRetryCaptchas,
  onExport,
  onExportAll,
  onBulkActions,
  onReminders,
  refreshTimer,
}: QuickActionsProps) {
  return (
    <div className="bg-slate-50/80 px-6 py-3 border-b border-slate-150">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">
          Quick Actions:
        </span>

        <button
          onClick={onCheckSelected}
          disabled={selectedCount === 0}
          className="bg-blue-50 text-blue-600 hover:bg-blue-100/80 px-4 py-2 rounded-lg transition-colors font-semibold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-blue-200/50"
        >
          <Search className="w-4 h-4" />
          <span>Check Selected ({selectedCount})</span>
        </button>

        <button
          onClick={onRetryCaptchas}
          className="bg-orange-50 text-orange-600 hover:bg-orange-100/85 px-4 py-2 rounded-lg transition-colors font-semibold text-sm flex items-center gap-2 border border-orange-200/50"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry Captchas</span>
        </button>

        <button
          onClick={onExport}
          className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100/85 px-4 py-2 rounded-lg transition-colors font-semibold text-sm flex items-center gap-2 border border-emerald-200/50"
        >
          <Download className="w-4 h-4" />
          <span>Export Selected</span>
        </button>

        <button
          onClick={onExportAll}
          className="bg-slate-50 text-slate-600 hover:bg-slate-150 px-4 py-2 rounded-lg transition-colors font-semibold text-sm flex items-center gap-2 border border-slate-200"
        >
          <Download className="w-4 h-4 text-slate-400" />
          <span>Export All</span>
        </button>

        <button
          onClick={onBulkActions}
          disabled={selectedCount === 0}
          className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100/80 px-4 py-2 rounded-lg transition-colors font-semibold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-200/50"
        >
          <Layers className="w-4 h-4" />
          <span>Bulk Actions</span>
        </button>

        <button
          onClick={onReminders}
          className="bg-purple-50 text-purple-600 hover:bg-purple-100/80 px-4 py-2 rounded-lg transition-colors font-semibold text-sm flex items-center gap-2 border border-purple-200/50"
        >
          <Calendar className="w-4 h-4" />
          <span>Reminders</span>
        </button>

        <div className="flex-grow"></div>

        <span className="text-xs text-slate-400 font-semibold tracking-wide bg-slate-50 border border-slate-150 px-2.5 py-1 rounded-md">
          Auto-refresh: {refreshTimer}
        </span>
      </div>
    </div>
  );
}
