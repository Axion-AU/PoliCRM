import { useEffect, useState } from "react";
import { systemApi } from "../api/queueApi";
import type { QueueStatus } from "../Queue.model";

export function useQueue(refreshMs = 5000) {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const data = await systemApi.getQueueStatus();
        if (active) {
          setStatus(data);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, refreshMs);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refreshMs]);

  return { status, loading };
}
