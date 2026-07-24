type Listener = (data: any) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;

    this.isConnecting = true;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    // Connect to /ws/updates - Vite proxy handles the connection to backend
    const url = `${protocol}//${host}/ws/updates`;

    console.log("Connecting to WebSocket:", url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.isConnecting = false;
      this.emit("connect", true);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "update") {
          if (msg.dashboard) this.emit("dashboard", msg.dashboard);
          if (msg.era) this.emit("era", msg.era);
        } else if (msg.type === "keepalive") {
            // responding to ping? Backend sends "keepalive" on timeout.
            // Client doesn't need to do anything, connection is alive.
        }
      } catch (error) {
        console.error("WebSocket message parse error:", error);
      }
    };

    this.ws.onclose = () => {
      console.log("WebSocket closed. Reconnecting in 3s...");
      this.ws = null;
      this.isConnecting = false;
      this.emit("disconnect", true);
      
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.ws?.close();
    };
  }

  subscribe(topic: string, callback: Listener) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic)?.add(callback);
    
    // Ensure connection is active when someone subscribes
    if (!this.ws && !this.isConnecting) {
        this.connect();
    }
  }

  unsubscribe(topic: string, callback: Listener) {
    this.listeners.get(topic)?.delete(callback);
  }

  private emit(topic: string, data: any) {
    this.listeners.get(topic)?.forEach((cb) => cb(data));
  }
}

export const webSocketService = new WebSocketService();
