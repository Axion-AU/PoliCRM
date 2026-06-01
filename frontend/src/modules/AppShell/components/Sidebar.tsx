import { useStore } from "@nanostores/react";
import { NavLink, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { $stats, fetchStats, resetDashboardFilters } from "@modules/Dashboard";
import { signOut } from "@modules/Auth";
import {
  LayoutDashboard,
  Map,
  Cpu,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Users,
  LogOut,
  Vote,
} from "lucide-react";

export function Sidebar() {
  const stats = useStore($stats);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      resetDashboardFilters();
      navigate("/login");
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const handleFilterClick = (status: string) => {
    // Reset other filters and set status
    updateFilters({
      search: "",
      status: [status],
      state: "all",
      tags: [],
      tagOperator: "AND",
    });
    navigate("/dashboard");
  };

  const handleResetFilters = () => {
    updateFilters({
      search: "",
      status: [],
      state: "all",
      tags: [],
      tagOperator: "AND",
    });
  };

  return (
    <div className="fixed inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 text-white shadow-2xl z-40 flex flex-col">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="relative w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
          <Vote className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">PoliCRM</h1>
          <p className="text-slate-400 text-xs mt-0.5 font-medium">
            Electoral Operations Console
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <NavLink
          to="/dashboard"
          end
          onClick={handleResetFilters}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-slate-800 text-white font-semibold shadow-sm border border-slate-700"
                : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
            }`
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/war-room"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-slate-800 text-white font-semibold shadow-sm border border-slate-700"
                : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
            }`
          }
        >
          <Map className="w-4 h-4" />
          <span>War Room</span>
        </NavLink>

        <NavLink
          to="/queue"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-slate-800 text-white font-semibold shadow-sm border border-slate-700"
                : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
            }`
          }
        >
          <Cpu className="w-4 h-4" />
          <span>Background Queue</span>
        </NavLink>

        <div className="border-t border-slate-800 my-4"></div>

        <div className="px-4 py-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Filter by Status
        </div>

        <button
          onClick={() => handleFilterClick("Verified")}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Verified</span>
          <span className="ml-auto bg-emerald-500/10 text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold">
            {stats.verified}
          </span>
        </button>

        <button
          onClick={() => handleFilterClick("Unchecked")}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all"
        >
          <Clock className="w-4 h-4 text-amber-400" />
          <span>Pending Check</span>
          <span className="ml-auto bg-amber-500/10 text-amber-400 text-xs px-2 py-0.5 rounded-full border border-amber-500/20 font-semibold">
            {stats.unchecked}
          </span>
        </button>

        <button
          onClick={() => handleFilterClick("Partial")}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all"
        >
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          <span>Partial Matches</span>
          <span className="ml-auto bg-orange-500/10 text-orange-400 text-xs px-2 py-0.5 rounded-full border border-orange-500/20 font-semibold">
            {stats.partial}
          </span>
        </button>

        <button
          onClick={() => handleFilterClick("Fail")}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all"
        >
          <XCircle className="w-4 h-4 text-rose-400" />
          <span>Failed Checks</span>
          <span className="ml-auto bg-rose-500/10 text-rose-400 text-xs px-2 py-0.5 rounded-full border border-rose-500/20 font-semibold">
            {stats.failed}
          </span>
        </button>

        <button
          onClick={() => handleFilterClick("Captcha")}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all"
        >
          <RefreshCw className="w-4 h-4 text-cyan-400" />
          <span>Captcha Issues</span>
          <span className="ml-auto bg-cyan-500/10 text-cyan-400 text-xs px-2 py-0.5 rounded-full border border-cyan-500/20 font-semibold">
            {stats.captcha}
          </span>
        </button>

        <button
          onClick={() => handleFilterClick("Duplicate")}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all"
        >
          <Users className="w-4 h-4 text-purple-400" />
          <span>Duplicates</span>
          <span className="ml-auto bg-purple-500/10 text-purple-400 text-xs px-2 py-0.5 rounded-full border border-purple-500/20 font-semibold">
            {stats.duplicate}
          </span>
        </button>

        <div className="border-t border-slate-800 my-4"></div>

        {/* User Info */}
        <div className="px-4 py-3 mt-auto bg-slate-950/40 rounded-xl border border-slate-800/40 mx-2">
          <div className="flex items-center justify-between gap-2 overflow-hidden">
            <div className="truncate flex-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Operator</p>
              <p className="text-xs text-slate-200 truncate mt-0.5 font-medium" title={auth.currentUser?.email || ""}>
                {auth.currentUser?.email || "system@policrm.org"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Footer Stats */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/50">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Metrics Overview</div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-2">
            <div className="text-lg font-bold text-slate-100">{stats.total}</div>
            <div className="text-[9px] font-semibold text-slate-400 uppercase">Total</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-2">
            <div className="text-lg font-bold text-emerald-400">
              {stats.total > 0
                ? Math.round((stats.verified / stats.total) * 100)
                : 0}
              %
            </div>
            <div className="text-[9px] font-semibold text-slate-400 uppercase">Verified</div>
          </div>
        </div>
      </div>
    </div>
  );
}
