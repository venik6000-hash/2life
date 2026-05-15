/**
 * WebSocket client manager with:
 * - One-time ticket authentication (?ticket=...)
 * - Auto-reconnect with exponential backoff
 * - Event handler registry
 */

const WS_URL = (() => {
  const { protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${host}/ws`;
})();

const MIN_RETRY_MS  = 1_000;
const MAX_RETRY_MS  = 30_000;
const HEARTBEAT_MS  = 25_000;

export class MsgSocket {
  constructor({ onMessage, onOpen, onClose, getTicket }) {
    this._onMessage  = onMessage;  // (event) => void
    this._onOpen     = onOpen;     // () => void
    this._onClose    = onClose;    // () => void
    this._getTicket  = getTicket;  // async () => string  — fetches a fresh ws-ticket
    this._ws         = null;
    this._retryDelay = MIN_RETRY_MS;
    this._stopped    = false;
    this._retryTimer = null;
    this._heartbeatTimer = null;
  }

  async connect() {
    if (this._stopped) return;
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      const ticket = await this._getTicket();
      let deviceId = "";
      try { deviceId = localStorage.getItem("dash_messenger_device_id") || ""; } catch (_) {}
      const url    = `${WS_URL}?ticket=${encodeURIComponent(ticket)}${deviceId ? `&deviceId=${encodeURIComponent(deviceId)}` : ""}`;
      const ws     = new WebSocket(url);
      this._ws     = ws;

      ws.onopen = () => {
        this._retryDelay = MIN_RETRY_MS;
        this._startHeartbeat();
        this._onOpen?.();
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          this._onMessage?.(data);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        this._stopHeartbeat();
        this._onClose?.();
        if (!this._stopped) this._scheduleReconnect();
      };

      ws.onerror = () => {
        this._stopHeartbeat();
        ws.close();
      };
    } catch {
      if (!this._stopped) this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => {
      this.connect();
    }, this._retryDelay);
    this._retryDelay = Math.min(this._retryDelay * 2, MAX_RETRY_MS);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      this.send({ type: "ping", ts: Date.now() });
    }, HEARTBEAT_MS);
  }

  _stopHeartbeat() {
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
  }

  send(payload) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  disconnect() {
    this._stopped = true;
    clearTimeout(this._retryTimer);
    this._stopHeartbeat();
    this._ws?.close();
    this._ws = null;
  }

  get connected() {
    return this._ws?.readyState === WebSocket.OPEN;
  }
}
