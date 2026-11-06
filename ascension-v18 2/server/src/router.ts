// ============================================================
// Routage des messages joueurs → règles. Partagé par le vrai serveur (WebSocket)
// et le serveur embarqué du mode solo (navigateur) : une seule source de vérité.
// ============================================================
import { GameRoom, makeCode } from './room';
import { FishRoom } from './fishroom';
import { gameAt } from '../../shared/games';

export type AnyRoom = GameRoom | FishRoom;
export interface Session { room: AnyRoom | null; player: any | null }
/** Ce que les salles attendent d'une connexion : `readyState` et `send`. */
export interface Sock { readyState: number; send(data: string): void }

export function makeRoom(gameId: string, code: string): AnyRoom {
  return gameId === 'fish' ? new FishRoom(code) : new GameRoom(code);
}
const isFish = (r: AnyRoom | null): r is FishRoom => !!r && r.game === 'fish';
const isCasino = (r: AnyRoom | null): r is GameRoom => !!r && r.game === 'ascension';

export function route(rooms: Map<string, AnyRoom>, s: Session, ws: Sock, msg: any) {
  const fail = (text: string) => ws.send(JSON.stringify({ t: 'error', text }));
  switch (msg.t) {
    case 'create': {
      let code = makeCode();
      while (rooms.has(code)) code = makeCode();
      const gameId = gameAt(String(msg.game ?? 'ascension')).id;
      const room = makeRoom(gameId, code);
      rooms.set(code, room);
      const p = room.addPlayer(String(msg.name ?? ''), ws as any, Number(msg.color ?? 0), Number(msg.hat ?? 0));
      if (typeof p === 'string') return fail(p);
      s.room = room; s.player = p;
      ws.send(JSON.stringify({ t: 'joined', token: p.token, code, youId: p.id, state: room.serialize() }));
      room.broadcast();
      return code;
    }
    case 'join': {
      const room = rooms.get(String(msg.code ?? '').toUpperCase());
      if (!room) return fail('Aucune table avec ce code.');
      const p = room.addPlayer(String(msg.name ?? ''), ws as any, Number(msg.color ?? 0), Number(msg.hat ?? 0));
      if (typeof p === 'string') return fail(p);
      s.room = room; s.player = p;
      ws.send(JSON.stringify({ t: 'joined', token: p.token, code: room.code, youId: p.id, state: room.serialize() }));
      room.broadcast();
      return;
    }
    case 'rejoin': {
      for (const room of rooms.values()) {
        const p = room.rejoin(String(msg.token ?? ''), ws as any);
        if (p) {
          s.room = room; s.player = p;
          ws.send(JSON.stringify({ t: 'joined', token: p.token, code: room.code, youId: p.id, state: room.serialize() }));
          return;
        }
      }
      return fail('Session expirée.');
    }
    case 'start': if (s.room && s.player) (s.room as any).start(s.player); return;
    // --- FISH & FURY ---
    case 'cast': if (isFish(s.room) && s.player) s.room.cast(s.player, Number(msg.power)); return;
    case 'hook': if (isFish(s.room) && s.player) s.room.hook(s.player); return;
    case 'dbgfish': if (isFish(s.room) && s.player) s.room.debugHook(s.player, String(msg.id), Number(msg.kg)); return;
    case 'reel': if (isFish(s.room) && s.player) s.room.reel(s.player, !!msg.on); return;
    case 'sell': if (isFish(s.room) && s.player) s.room.sell(s.player); return;
    case 'shop': if (isFish(s.room) && s.player) s.room.buy(s.player, String(msg.kind), String(msg.id)); return;
    // --- ASCENSION ---
    case 'bet': if (isCasino(s.room) && s.player) s.room.bet(s.player, String(msg.machineId), Number(msg.amount), String(msg.opt ?? '')); return;
    case 'bj': if (isCasino(s.room) && s.player) s.room.bjAction(s.player, String(msg.action)); return;
    case 'cashout': if (isCasino(s.room) && s.player) s.room.cashout(s.player); return;
    case 'move': if (s.room && s.player) s.room.move(s.player, Number(msg.x), Number(msg.z)); return;
    case 'hilo': if (isCasino(s.room) && s.player) s.room.hiloChoice(s.player, String(msg.choice)); return;
    case 'mines': if (isCasino(s.room) && s.player) s.room.minesPick(s.player, Number(msg.cell)); return;
    case 'radio': if (s.room && s.player) s.room.setStation(s.player, String(msg.station)); return;
    case 'elevator': if (isCasino(s.room) && s.player) s.room.elevator(s.player); return;
    case 'buy': if (isCasino(s.room) && s.player) s.room.buy(s.player, String(msg.itemId)); return;
    case 'emote': if (s.room && s.player) s.room.emote(s.player, Number(msg.i)); return;
  }
}
