import { apiCall } from "@shared/infrastructure/httpClient";
import type { QueueStatus } from "../Queue.model";

export const systemApi = {
  getQueueStatus: () => apiCall<QueueStatus>("/system/queue"),
};
