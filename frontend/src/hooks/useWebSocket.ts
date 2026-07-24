import { useEffect, useState } from "react";

interface WebSocketMessage {
  type: string;
  era?: {
    uploads: Array<{
      id: number;
      filename: string;
      state: string;
      record_count: number;
      status: string;
    }>;
    total_records: number;
  };
  dashboard?: {
    verified_count: number;
    failed_count: number;
    partial_match_count: number;
    unchecked_count: number;
    total_members: number;
  };
  queue?: {
    is_running: boolean;
    current_job: string | null;
    jobs_pending: number;
    jobs_completed: number;
    last_error: string | null;
  };
}

type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/updates`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("WebSocket connected");
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          if (message.type === "keepalive") return;
          this.handlers.forEach((handler) => handler(message));
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };

      this.ws.onclose = () => {
        console.log("WebSocket disconnected");
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    } catch (e) {
      console.error("Failed to create WebSocket:", e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnect attempts reached");
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      console.log(`Reconnecting WebSocket (attempt ${this.reconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler);
    if (this.handlers.size === 1) {
      this.connect();
    }
  }

  unsubscribe(handler: MessageHandler) {
    this.handlers.delete(handler);
    if (this.handlers.size === 0) {
      this.disconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Singleton instance
const wsManager = new WebSocketManager();

export function useWebSocket() {
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const handler: MessageHandler = (message) => {
      setLastMessage(message);
      setIsConnected(true);
    };

    wsManager.subscribe(handler);

    return () => {
      wsManager.unsubscribe(handler);
    };
  }, []);

  return { lastMessage, isConnected };
}

export function useWebSocketData<T>(
  selector: (message: WebSocketMessage) => T | undefined,
  initialValue: T
): { data: T; isConnected: boolean } {
  const [data, setData] = useState<T>(initialValue);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const handler: MessageHandler = (message) => {
      const selected = selector(message);
      if (selected !== undefined) {
        setData(selected);
      }
      setIsConnected(true);
    };

    wsManager.subscribe(handler);

    return () => {
      wsManager.unsubscribe(handler);
    };
  }, []);

  return { data, isConnected };
}

export type { WebSocketMessage };
