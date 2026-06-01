import { useState, useEffect } from "react";
import { systemApi } from "../api/queueApi";
import type { QueueStatus } from "../Queue.model";

export default function QueuePage() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await systemApi.getQueueStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch queue status:", err);
      setError("Failed to fetch queue status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading && !status) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && !status) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Background Queue</h1>
        <p className="text-slate-500 mt-1">
          Monitor active workers and queued jobs
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm font-medium text-slate-500 mb-1">
            Queue Size
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {status?.queue_size}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm font-medium text-slate-500 mb-1">
            Active Workers
          </div>
          <div className="text-3xl font-bold text-indigo-600">
            {
              Object.values(status?.workers || {}).filter(
                (w) => w.status !== "idle",
              ).length
            }
            <span className="text-lg text-slate-400 font-normal ml-2">
              / {status?.pool_size}
            </span>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm font-medium text-slate-500 mb-1">Status</div>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${status?.queue_size && status.queue_size > 0 ? "bg-green-500 animate-pulse" : "bg-slate-300"}`}
            ></div>
            <span className="text-lg font-medium text-slate-700">
              {status?.queue_size && status.queue_size > 0
                ? "Processing"
                : "Idle"}
            </span>
          </div>
        </div>
      </div>

      {/* Active Workers */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Active Workers
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: status?.pool_size || 0 }).map((_, i) => {
            const worker = status?.workers[i.toString()];
            const isIdle = !worker || worker.status === "idle";

            return (
              <div
                key={i}
                className={`bg-white rounded-xl shadow-sm border p-6 transition-all ${isIdle ? "border-slate-200 opacity-75" : "border-indigo-200 ring-1 ring-indigo-100"}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${isIdle ? "bg-slate-100 text-slate-500" : "bg-indigo-100 text-indigo-600"}`}
                    >
                      W{i}
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">
                        Worker {i}
                      </div>
                      <div
                        className={`text-xs ${isIdle ? "text-slate-500" : "text-indigo-600 font-medium"}`}
                      >
                        {isIdle ? "Idle" : "Processing"}
                      </div>
                    </div>
                  </div>
                  {!isIdle && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>
                  )}
                </div>

                {worker && worker.status !== "idle" ? (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-500">
                      Currently checking:
                    </div>
                    <div className="font-medium text-slate-900">
                      {worker.member_name}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      ID: {worker.member_id}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 italic">
                    Waiting for jobs...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Queue List */}
      {status?.queued_items && status.queued_items.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-medium text-slate-900">
              Queued Jobs ({status.queued_items.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {status.queued_items.map((id) => (
              <div
                key={id}
                className="px-6 py-3 flex items-center gap-3 text-sm text-slate-600"
              >
                <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                <span>
                  Member ID:{" "}
                  <span className="font-mono text-slate-900">{id}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
