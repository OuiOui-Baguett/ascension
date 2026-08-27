// Client WebSocket : reconnexion automatique avec token de session.
type Handler = (msg: any) => void;

const WS_URL = import.meta.env.DEV
  ? `ws://${location.hostname}:2567/ws`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

class Net {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();
  private retry = 0;
  token: string | null = localStorage.getItem('ascension_token');

  on(type: string, fn: Handler) {
    const arr = this.handlers.get(type) ?? [];
    arr.push(fn);
    this.handlers.set(type, arr);
  }
  private emit(type: string, msg: any) {
    for (const fn of this.handlers.get(type) ?? []) fn(msg);
  }

  connect() {
    this.ws = new WebSocket(WS_URL);
    this.ws.onopen = () => {
      this.retry = 0;
      this.emit('open', {});
      if (this.token) this.send({ t: 'rejoin', token: this.token });
    };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'joined') {
        this.token = msg.token;
        localStorage.setItem('ascension_token', msg.token);
      }
      if (msg.t === 'error' && msg.text === 'Session expirée.' && this.token) {
        localStorage.removeItem('ascension_token');
        this.token = null;
      }
      this.emit(msg.t, msg);
    };
    this.ws.onclose = () => {
      this.emit('closed', {});
      const delay = Math.min(5000, 300 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  send(msg: object) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
  forget() {
    localStorage.removeItem('ascension_token');
    this.token = null;
  }
}

export const net = new Net();
