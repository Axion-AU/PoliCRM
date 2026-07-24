import { useEffect, useState } from "react";
import { ClipboardList, CheckCircle, AlertCircle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useWebSocketData } from "../../hooks/useWebSocket";

interface EraStatus {
  total_records: number;
  uploads: Array<{
    id: number;
    filename: string;
    state: string;
    record_count: number;
    status: string;
  }>;
}

export function EraStatusWidget() {
  const { data: status, isConnected } = useWebSocketData<EraStatus | null>(
    (msg) => msg.era ? { total_records: msg.era.total_records, uploads: msg.era.uploads } : undefined,
    null
  );
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== null) {
      setLoading(false);
    }
  }, [status]);

  // Fallback fetch on mount if WS hasn't connected yet
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/era/stats");
        if (res.ok) {
          await res.json();
          // Data will come via websocket, this is just a backup
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch ERA stats:", error);
      }
    };

    if (isConnected) {
      setLoading(false);
    } else {
      fetchStatus();
    }

    const timer = setTimeout(() => {
      if (loading && !isConnected) {
        fetchStatus();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [isConnected, loading]);

  const activeUpload = status?.uploads?.find(u => u.status === "parsing");
  const isLoaded = (status?.total_records ?? 0) > 0;

  return (
    <div className="card h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 stat-icon-green rounded-lg">
            <ClipboardList className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-foreground">Electoral Roll</h3>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      <div className="flex-1 p-5">
        {loading ? (
          <div className="text-center text-muted-foreground">Connecting...</div>
        ) : status ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  activeUpload ? "text-blue-400" : isLoaded ? "text-green-400" : "text-amber-400"
                }`}
              >
                {activeUpload ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : isLoaded ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {activeUpload ? "Parsing..." : isLoaded ? "Loaded" : "Empty"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Records</span>
              <span className="text-sm font-medium text-foreground">
                {status.total_records?.toLocaleString() ?? "0"}
              </span>
            </div>
            {activeUpload && (
              <div className="mt-4 p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Currently Parsing</div>
                <div className="text-sm text-foreground truncate">{activeUpload.filename}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {activeUpload.record_count?.toLocaleString() ?? 0} records
                </div>
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
