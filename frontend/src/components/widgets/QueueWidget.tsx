import { useEffect, useState } from "react";
import { RefreshCw, Play, Pause, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { useWebSocketData } from "../../hooks/useWebSocket";

interface QueueStatus {
  is_running: boolean;
  current_job: string | null;
  jobs_pending: number;
  jobs_completed: number;
  last_error: string | null;
}

export function QueueWidget() {
  const { data: status, isConnected } = useWebSocketData<QueueStatus | null>(
    (msg) => msg.queue,
    null
  );
  
  const [loading, setLoading] = useState(true);
  const [localStatus, setLocalStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState(false);

  // Use websocket data if available, otherwise fallback to local fetch
  const displayStatus = status || localStatus;

  useEffect(() => {
    if (status !== null) {
      setLoading(false);
      setError(false);
    }
  }, [status]);

  // Fallback fetch if websocket doesn't have queue data
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/system/queue");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setLocalStatus(data);
      setError(false);
    } catch (err) {
      console.error("Failed to fetch queue status:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch as backup
    fetchStatus();
    // Periodic fallback if WS doesn't provide queue data
    const interval = setInterval(() => {
      if (!status) fetchStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [status]);

  const handleToggle = async () => {
    try {
      if (displayStatus?.is_running) {
        await fetch("/api/queue/stop", { method: "POST" });
      } else {
        await fetch("/api/queue/start", { method: "POST" });
      }
      fetchStatus();
    } catch (err) {
      console.error("Failed to toggle queue:", err);
    }
  };

  return (
    <div className="card h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 stat-icon-blue rounded-lg">
            <RefreshCw className={`w-5 h-5 ${displayStatus?.is_running ? "animate-spin" : ""}`} />
          </div>
          <h3 className="font-semibold text-foreground">Verification Queue</h3>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-muted-foreground" />
          )}
          <button
            onClick={handleToggle}
            disabled={loading || error}
            className={`p-2 rounded-lg transition-colors ${
              displayStatus?.is_running
                ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                : "bg-green-500/15 text-green-400 hover:bg-green-500/25"
            } disabled:opacity-50`}
          >
            {displayStatus?.is_running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 p-5">
        {loading && !displayStatus ? (
          <div className="text-center text-muted-foreground">Loading...</div>
        ) : error && !displayStatus ? (
          <div className="text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <p className="text-sm">Queue service unavailable</p>
          </div>
        ) : displayStatus ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span
                className={`text-sm font-medium px-2 py-0.5 rounded ${
                  displayStatus.is_running
                    ? "bg-green-500/15 text-green-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {displayStatus.is_running ? "Running" : "Stopped"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pending</span>
              <span className="text-sm font-medium text-foreground">{displayStatus.jobs_pending ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Completed</span>
              <span className="text-sm font-medium text-foreground">{displayStatus.jobs_completed ?? 0}</span>
            </div>
            {displayStatus.current_job && (
              <div className="mt-4 p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Processing</div>
                <div className="text-sm text-foreground truncate">{displayStatus.current_job}</div>
              </div>
            )}
            {displayStatus.last_error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-400">{displayStatus.last_error}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-muted-foreground">No data available</div>
        )}
      </div>
    </div>
  );
}
