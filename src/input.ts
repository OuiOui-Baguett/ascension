// ============================================================
// Commandes. Téléphone : pouce gauche = joystick (n'importe où à gauche),
// glisser à droite = regarder, boutons à droite. Ordinateur : ZQSD/WASD,
// souris (clic pour verrouiller), clic gauche = frapper, clic droit ou E = pouvoir,
// Espace = sauter, Maj = esquive.
// ============================================================
export class Input {
  mx = 0; my = 0;               // joystick (-1..1), my > 0 = avancer
  lookX = 0; lookY = 0;         // déplacement de la vue accumulé depuis la dernière lecture (pixels)
  private pressed = new Set<string>();
  /** boutons tenus enfoncés (frapper en continu) */
  held = new Set<string>();
  private lookT = 0;
  private keys = new Set<string>();
  private joyId = -1; private joyO = { x: 0, y: 0 }; private lookId = -1; private lookP = { x: 0, y: 0 };
  enabled = false;
  touch = matchMedia('(pointer: coarse)').matches;
  constructor(private canvas: HTMLCanvasElement, private joy: HTMLElement, private knob: HTMLElement) {
    addEventListener('keydown', e => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Space') { this.pressed.add('jump'); e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.pressed.add('dash');
      if (e.code === 'KeyE' || e.code === 'KeyF') this.pressed.add('blast');
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', e => {
      if (this.touch || !this.enabled) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) { this.pressed.add('punch'); this.held.add('punch'); } else if (e.button === 2) this.pressed.add('blast');
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.held.delete('punch'); });
    addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { this.lookX += e.movementX; this.lookY += e.movementY; } });
    // tactile
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !this.enabled) return;
      if (e.clientX < innerWidth * .45 && this.joyId < 0) {
        this.joyId = e.pointerId; this.joyO = { x: e.clientX, y: e.clientY };
        joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; joy.classList.add('on');
      } else if (this.lookId < 0) { this.lookId = e.pointerId; this.lookP = { x: e.clientX, y: e.clientY }; this.lookT = e.timeStamp; }
    });
    addEventListener('pointermove', e => {
      if (e.pointerId === this.joyId) {
        let dx = e.clientX - this.joyO.x, dy = e.clientY - this.joyO.y; const l = Math.hypot(dx, dy), R = 55;
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.mx = dx / R; this.my = -dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (e.pointerId === this.lookId) {
        // accélération : un glissé rapide tourne plus (demi-tour facile), un glissé lent reste précis
        const dx = e.clientX - this.lookP.x, dy = e.clientY - this.lookP.y, ms = Math.max(4, e.timeStamp - this.lookT);
        const v = Math.hypot(dx, dy) / ms, gain = 1.5 * (1 + Math.min(1, v / 2.2) * .9);
        this.lookX += dx * gain; this.lookY += dy * gain * .85; this.lookP = { x: e.clientX, y: e.clientY }; this.lookT = e.timeStamp;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.joyId) { this.joyId = -1; this.mx = this.my = 0; knob.style.transform = ''; joy.classList.remove('on'); }
      if (e.pointerId === this.lookId) this.lookId = -1;
      for (const [a, id] of this.btnPtr) if (id === e.pointerId) { this.held.delete(a); this.btnPtr.delete(a); }
    };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  /** Bouton à l'écran : l'appui déclenche l'action, et le doigt peut ensuite glisser pour viser. */
  bindButton(el: HTMLElement, action: string) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (!this.enabled) return;
      this.pressed.add(action); this.held.add(action); this.btnPtr.set(action, e.pointerId); el.classList.add('down');
      if (this.lookId < 0 && action !== 'jump') { this.lookId = e.pointerId; this.lookP = { x: e.clientX, y: e.clientY }; this.lookT = e.timeStamp; }
    });
    const off = (e: PointerEvent) => { if (this.btnPtr.get(action) === e.pointerId) { this.held.delete(action); this.btnPtr.delete(action); } el.classList.remove('down'); };
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    addEventListener('pointerup', e => { if (this.btnPtr.get(action) === e.pointerId) el.classList.remove('down'); });
  }
  private btnPtr = new Map<string, number>();
  /** Lit une action appuyée depuis la dernière fois. */
  take(a: string) { const h = this.pressed.has(a); this.pressed.delete(a); return h; }
  clear() { this.pressed.clear(); this.held.clear(); this.mx = this.my = 0; this.lookX = this.lookY = 0; }
  /** Direction de marche voulue (clavier + joystick). */
  move() {
    let x = this.mx, y = this.my;
    const k = this.keys;
    if (k.has('KeyW') || k.has('KeyZ') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('KeyQ') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
}
