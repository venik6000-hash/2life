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
  }

  async connect() {
    if (this._stopped) return;
    try {
      const ticket = await this._getTicket();
      const url    = `${WS_URL}?ticket=${encodeURIComponent(ticket)}`;
      const ws     = new WebSocket(url);
      this._ws     = ws;

      ws.onopen = () => {
        this._retryDelay = MIN_RETRY_MS;
        this._onOpen?.();
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          this._onMessage?.(data);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        this._onClose?.();
        if (!this._stopped) this._scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      if (!this._stopped) this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    this._retryTimer = setTimeout(() => {
      this.connect();
    }, this._retryDelay);
    this._retryDelay = Math.min(this._retryDelay * 2, MAX_RETRY_MS);
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
    this._ws?.close();
    this._ws = null;
  }

  get connected() {
    return this._ws?.readyState === WebSocket.OPEN;
  }
}
