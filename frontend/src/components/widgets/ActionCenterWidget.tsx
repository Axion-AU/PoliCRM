import { useNavigate } from "react-router-dom";
import { Upload, UserPlus, Play, FileDown, Zap } from "lucide-react";

export function ActionCenterWidget() {
  const navigate = useNavigate();

  const actions = [
    {
      icon: Upload,
      label: "Import CSV",
      onClick: () => navigate("/members"),
      color: "text-blue-400",
      bg: "bg-blue-500/15 hover:bg-blue-500/25",
    },
    {
      icon: UserPlus,
      label: "Add Contact",
      onClick: () => navigate("/members"),
      color: "text-green-400",
      bg: "bg-green-500/15 hover:bg-green-500/25",
    },
    {
      icon: Play,
      label: "Start Verification",
      onClick: () => navigate("/queue"),
      color: "text-purple-400",
      bg: "bg-purple-500/15 hover:bg-purple-500/25",
    },
    {
      icon: FileDown,
      label: "Export Data",
      onClick: () => navigate("/members"),
      color: "text-amber-400",
      bg: "bg-amber-500/15 hover:bg-amber-500/25",
    },
  ];

  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <div className="p-2 stat-icon-amber rounded-lg">
          <Zap className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-foreground">Quick Actions</h3>
      </div>

      <div className="p-4 grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-colors ${action.bg}`}
          >
            <action.icon className={`w-6 h-6 ${action.color}`} />
            <span className="text-xs font-medium text-foreground">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
