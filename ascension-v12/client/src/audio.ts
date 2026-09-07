// ============================================================
// Audio 100 % synthétisé (Web Audio) — aucun fichier à charger.
// Débloqué au premier appui, comme l'exige iOS.
// ============================================================
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambient: { osc: OscillatorNode[]; gain: GainNode } | null = null;
let muted = localStorage.getItem('ascension_mute') === '1';

export function audioReady(): boolean { return !!ctx; }
export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  localStorage.setItem('ascension_mute', muted ? '1' : '0');
  if (master) master.gain.value = muted ? 0 : 0.9;
  return muted;
}

/** À appeler sur le premier geste utilisateur (iOS l'exige). */
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
}

/** Enveloppe calée sur l'instant de départ RÉEL (sinon une note retardée sonne dans le vide). */
function env(dur: number, peak = 0.3, when = 0, attack = 0.005): GainNode {
  const g = ctx!.createGain();
  const t = ctx!.currentTime + when;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

/** Une note simple. */
function tone(freq: number, dur = .12, type: OscillatorType = 'square', peak = .22, when = 0, slideTo?: number) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  const g = env(dur, peak, when);
  o.type = type;
  const t = ctx.currentTime + when;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  o.connect(g); g.connect(master!);
  o.start(t); o.stop(t + dur + .02);
}

/** Bruit filtré : impacts, souffle, pièces. */
function noise(dur = .12, freq = 1800, q = 1, peak = .18, when = 0) {
  if (!ctx || muted) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = env(dur, peak, when, .002);
  src.connect(f); f.connect(g); g.connect(master!);
  src.start(ctx.currentTime + when);
}

const S = {
  tap:      () => { tone(520, .05, 'square', .12); },
  click:    () => { noise(.035, 2600, 3, .13); },
  reelStop: () => { noise(.06, 900, 4, .22); tone(180, .07, 'square', .12); },
  lever:    () => { noise(.18, 400, 2, .18); tone(90, .22, 'sawtooth', .1, 0, 60); },
  coin:     (n = 8) => { for (let i = 0; i < n; i++) { const w = i * .045; tone(1200 + Math.random() * 900, .07, 'triangle', .1, w); noise(.05, 5000, 6, .07, w); } },
  win:      () => { [523, 659, 784].forEach((f, i) => tone(f, .18, 'triangle', .2, i * .07)); S.coin(10); },
  bigWin:   () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .3, 'triangle', .24, i * .085)); S.coin(22); },
  jackpot:  () => { [784, 988, 1175, 1568].forEach((f, i) => { tone(f, .5, 'square', .2, i * .1); tone(f * 1.5, .5, 'triangle', .12, i * .1); }); S.coin(30); },
  lose:     () => { tone(220, .28, 'sawtooth', .16, 0, 90); noise(.2, 300, 1, .12); },
  bust:     () => { noise(.42, 220, .8, .3); tone(150, .5, 'sawtooth', .22, 0, 45); },
  card:     () => { noise(.07, 3200, 2, .14); },
  dice:     () => { for (let i = 0; i < 6; i++) noise(.05, 700 + Math.random() * 900, 5, .12, i * .07); },
  chest:    () => { noise(.14, 500, 2, .2); tone(300, .16, 'square', .12, .02, 520); },
  ball:     () => { for (let i = 0; i < 9; i++) noise(.03, 2400, 8, .09, i * .26); },
  buy:      () => { [660, 880].forEach((f, i) => tone(f, .14, 'triangle', .2, i * .09)); },
  tick:     () => { tone(880, .05, 'square', .16); },
  tickHot:  () => { tone(1320, .06, 'square', .22); noise(.04, 3000, 4, .1); },
  ding:     () => { [1047, 1568].forEach((f, i) => tone(f, .5, 'sine', .26, i * .12)); },
  fall:     () => { tone(400, 1.5, 'sawtooth', .3, 0, 40); noise(1.2, 200, .7, .22); },
  victory:  () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, .5, 'triangle', .26, i * .13)); S.coin(26); },
  emote:    () => { tone(880, .07, 'sine', .16); tone(1320, .07, 'sine', .12, .05); },
  deny:     () => { tone(160, .16, 'square', .16); },
};

export function play(name: keyof typeof S, arg?: number) {
  if (!ctx || muted) return;
  try { (S[name] as any)(arg); } catch { /* le son ne doit jamais casser le jeu */ }
}

/** Nappe d'ambiance : deux oscillateurs accordés à l'étage. */
export function setAmbient(floor: number) {
  if (!ctx || muted) { return; }
  stopAmbient();
  const roots = [55, 49, 41, 62, 65];               // une couleur par étage
  const root = roots[(floor - 1) % 5];
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(.055, ctx.currentTime + 2.5);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 420;
  const oscs: OscillatorNode[] = [];
  for (const [mult, type] of [[1, 'sine'], [1.5, 'triangle'], [2.02, 'sine']] as [number, OscillatorType][]) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = root * mult;
    o.connect(f); o.start();
    oscs.push(o);
  }
  f.connect(g); g.connect(master!);
  ambient = { osc: oscs, gain: g };
}
export function stopAmbient() {
  if (!ambient || !ctx) return;
  const a = ambient; ambient = null;
  try {
    a.gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .6);
    setTimeout(() => a.osc.forEach(o => { try { o.stop(); } catch {} }), 800);
  } catch {}
}
