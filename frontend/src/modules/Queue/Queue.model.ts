export interface QueueItem {
  member_id: number;
  status: string;
}

export interface WorkerStatus {
  status: string;
  member_id: number | null;
  member_name: string | null;
}

export interface QueueStatus {
  queue_size: number;
  queued_items: number[];
  workers: Record<string, WorkerStatus>;
  pool_size: number;
}
