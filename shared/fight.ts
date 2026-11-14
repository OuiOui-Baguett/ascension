// ============================================================
// Physique des combattants et règles des coups. Le même code fait bouger
// son propre personnage dans la page (réactivité immédiate) et les bots sur le serveur.
// ============================================================
import { groundAt, pushOut, DROWN_Y } from './island';

export const MOVE = {
  speed: 6.4, accel: 48, airAccel: 16, gravity: 25, jump: 9, airJump: 7.8,
  dash: 16, dashTime: .17, dashCd: 1.1, radius: .45, height: 1.75, eye: 1.55,
};

export interface Body {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  ground: boolean; airJumps: number; dashT: number; dashCd: number;
  /** temps restant pendant lequel on vole sous l'effet d'un coup (contrôle réduit) */
  stun: number;
}
export interface MoveInput { mx: number; mz: number; jump: boolean; dash: boolean }

export const newBody = (x: number, y: number, z: number): Body =>
  ({ x, y, z, vx: 0, vy: 0, vz: 0, ground: false, airJumps: 1, dashT: 0, dashCd: 0, stun: 0 });

/** Avance un corps de dt secondes. Renvoie true s'il vient de tomber dans l'eau profonde. */
export function stepBody(b: Body, inp: MoveInput, dt: number): boolean {
  const n = Math.max(1, Math.ceil(dt / (1 / 90))), h = dt / n;
  let jump = inp.jump, dash = inp.dash;
  for (let i = 0; i < n; i++) {
    b.dashCd = Math.max(0, b.dashCd - h); b.stun = Math.max(0, b.stun - h);
    const ml = Math.hypot(inp.mx, inp.mz), mx = ml > 1 ? inp.mx / ml : inp.mx, mz = ml > 1 ? inp.mz / ml : inp.mz;
    // esquive : petite ruée dans la direction voulue (ou devant soi)
    if (dash && b.dashCd <= 0 && b.stun < .15) {
      const l = Math.hypot(mx, mz) || 1;
      b.vx = mx / l * MOVE.dash; b.vz = mz / l * MOVE.dash; if (!b.ground) b.vy = Math.max(b.vy, 2);
      b.dashT = MOVE.dashTime; b.dashCd = MOVE.dashCd; b.stun = 0;
    }
    dash = false;
    if (b.dashT > 0) b.dashT -= h;
    else if (b.stun > 0) { const k = Math.exp(-h * .9); b.vx *= k; b.vz *= k; }          // on vole : presque pas de freinage
    else {
      const a = (b.ground ? MOVE.accel : MOVE.airAccel) * h, tx = mx * MOVE.speed, tz = mz * MOVE.speed;
      const dx = tx - b.vx, dz = tz - b.vz, dl = Math.hypot(dx, dz);
      if (dl <= a) { b.vx = tx; b.vz = tz; } else { b.vx += dx / dl * a; b.vz += dz / dl * a; }
    }
    if (jump) {
      if (b.ground) { b.vy = MOVE.jump; b.ground = false; }
      else if (b.airJumps > 0 && b.stun < .2) { b.vy = MOVE.airJump; b.airJumps--; }
      jump = false;
    }
    b.vy -= MOVE.gravity * h;
    const py = b.y;
    b.x += b.vx * h; b.z += b.vz * h; b.y += b.vy * h;
    if (pushOut(b, b.y, MOVE.radius, MOVE.height) && b.stun > 0) { b.vx *= .5; b.vz *= .5; }
    const g = groundAt(b.x, b.z, Math.max(py, b.y));
    if (b.y <= g && b.vy <= 0) {
      // gros choc au sol pendant un vol : petit rebond
      if (b.stun > 0 && b.vy < -9) { b.y = g; b.vy = -b.vy * .3; }
      else { b.y = g; b.vy = 0; b.ground = true; b.airJumps = 1; }
    } else if (b.y > g + .05) b.ground = false;
    if (b.y < DROWN_Y) return true;
  }
  return false;
}

// ---------- les coups ----------
export const PUNCH = { range: 2.4, cos: .5, cd: .34, dmg: 7, dmg3: 11, kb: 5, kb3: 8, scale: .11, comboWindow: .7 };
export const BLAST = { speed: 26, radius: .55, life: 1.6, cd: 3.2, dmg: 12, kb: 7.5, scale: .13, splash: 2.4 };
export const RESPAWN_MS = 2600, SHIELD_MS = 2000;

/** Vitesse d'éjection : plus la jauge est haute, plus on vole loin. */
export function knock(base: number, scale: number, pct: number) { return base + pct * scale; }
/** Durée du vol incontrôlé après un coup. */
export const stunFor = (kb: number) => Math.min(1.1, .12 + kb * .035);
