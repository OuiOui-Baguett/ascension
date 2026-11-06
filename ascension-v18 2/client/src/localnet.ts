// ============================================================
// Serveur embarqué : les mêmes règles que le vrai serveur, mais dans le navigateur.
// Sert au mode solo hors-ligne et à l'aperçu publié (aucun serveur à héberger).
// ============================================================
import { route, type AnyRoom, type Session } from '../../server/src/router';

const rooms = new Map<string, AnyRoom>();

export class LocalSocket {
  readyState = 1;
  private s: Session = { room: null, player: null };
  constructor(private deliver: (data: string) => void) {}
  /** Message du serveur → client (asynchrone, comme un vrai réseau). */
  send(data: string) { setTimeout(() => this.deliver(data), 0); }
  /** Message du client → serveur. */
  post(msg: any) {
    try { route(rooms, this.s, this, msg); } catch (e) { console.error('local route', e); }
  }
}
