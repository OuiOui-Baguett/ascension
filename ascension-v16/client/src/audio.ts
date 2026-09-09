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

// ============================================================
//  RADIO — moteur de musique générative.
//  Rien n'est enregistré : un ordonnanceur réveille des oscillateurs
//  en avance de phase et compose la boucle en direct, station par station.
// ============================================================

let radioBus: GainNode | null = null;      // départ « salle » (réverbération)
let dryBus: GainNode | null = null;
let radio: { id: string; timer: any; step: number; next: number } | null = null;

/** Réverbération : réponse impulsionnelle générée (bruit qui décroît). Donne l'espace. */
function makeReverb(seconds = 2.2, decay = 2.6): ConvolverNode {
  const n = Math.floor(ctx!.sampleRate * seconds);
  const buf = ctx!.createBuffer(2, n, ctx!.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  const cv = ctx!.createConvolver(); cv.buffer = buf;
  return cv;
}

function ensureRadioBus() {
  if (radioBus || !ctx) return;
  dryBus = ctx.createGain(); dryBus.gain.value = 0.5;
  dryBus.connect(master!);
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  const rev = makeReverb();
  rev.connect(wet); wet.connect(master!);
  radioBus = ctx.createGain(); radioBus.gain.value = 1;
  radioBus.connect(dryBus); radioBus.connect(rev);
}

// --- petits instruments, tous synthétisés ---
function kick(t: number, peak = .5) {
  const o = ctx!.createOscillator(), g = ctx!.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(42, t + .11);
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(.0001, t + .28);
  o.connect(g); g.connect(dryBus!);
  o.start(t); o.stop(t + .3);
}
function noiseAt(t: number, dur: number, freq: number, q: number, peak: number, type: BiquadFilterType = 'bandpass', toRev = true) {
  const n = Math.max(1, Math.floor(ctx!.sampleRate * dur));
  const buf = ctx!.createBuffer(1, n, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx!.createBufferSource(); src.buffer = buf;
  const f = ctx!.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(toRev ? radioBus! : dryBus!);
  src.start(t); src.stop(t + dur + .02);
}
const snare = (t: number, p = .3) => { noiseAt(t, .18, 1900, 1.1, p); noiseAt(t, .06, 320, 2, p * .5, 'bandpass', false); };
const brush = (t: number, p = .12) => noiseAt(t, .14, 5200, .7, p);
const hat = (t: number, open = false, p = .12) => noiseAt(t, open ? .18 : .045, 9000, .9, p);
const clank = (t: number, p = .22) => { noiseAt(t, .3, 2400, 6, p); noiseAt(t, .12, 5200, 8, p * .6); };

/** Voix mélodique générique : oscillateur + filtre + enveloppe. */
function voice(t: number, freq: number, dur: number, type: OscillatorType, peak: number,
               cutoff = 4000, detune = 0, attack = .008, toRev = true) {
  const o = ctx!.createOscillator(), g = ctx!.createGain(), f = ctx!.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * .35), t + dur);
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(toRev ? radioBus! : dryBus!);
  o.start(t); o.stop(t + dur + .03);
}
/** Marimba / kalimba : sinus + harmonique qui s'éteint vite. */
function mallet(t: number, freq: number, peak = .2, dur = .5) {
  voice(t, freq, dur, 'sine', peak, 5200, 0, .004);
  voice(t, freq * 3.01, dur * .35, 'sine', peak * .3, 6000, 0, .003);
}
/** Accord tenu, trois oscillateurs légèrement désaccordés. */
function pad(t: number, freqs: number[], dur: number, peak = .07, type: OscillatorType = 'sawtooth', cutoff = 900) {
  for (const fr of freqs) for (const det of [-7, 7]) {
    const o = ctx!.createOscillator(), g = ctx!.createGain(), f = ctx!.createBiquadFilter();
    o.type = type; o.frequency.value = fr; o.detune.value = det;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * .35);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(radioBus!);
    o.start(t); o.stop(t + dur + .05);
  }
}

// --- théorie : gammes et grilles d'accords, en demi-tons depuis la fondamentale ---
const HZ = (semi: number) => 55 * Math.pow(2, semi / 12);          // 0 = La1
const MIN7 = [0, 3, 7, 10], MAJ7 = [0, 4, 7, 11], MIN = [0, 3, 7], DOM7 = [0, 4, 7, 10];

interface Station {
  bpm: number;
  bars: number;                                   // longueur de la grille
  chords: { root: number; kind: number[] }[];     // un accord par mesure
  step: (n: number, t: number, bar: number, beat: number, chord: { root: number; kind: number[] }) => void;
}

const STATION_ENGINES: Record<string, Station> = {
  // ---- Tam-Tam Club : marimba, congas, basse ronde ----
  tamtam: {
    bpm: 96, bars: 4,
    chords: [{ root: 2, kind: MIN7 }, { root: 2, kind: MIN7 }, { root: 7, kind: MIN7 }, { root: 9, kind: DOM7 }],
    step(n, t, bar, beat, c) {
      const b = n % 16;
      if (b === 0 || b === 6 || b === 10) kick(t, .42);
      if (b === 4 || b === 12) noiseAt(t, .12, 420, 3, .22);          // conga grave
      if (b === 7 || b === 14) noiseAt(t, .08, 900, 4, .16);          // conga aiguë
      if (b % 2 === 1) hat(t, b === 15, .06);
      if (b === 0) { pad(t, c.kind.map(k => HZ(c.root + k + 24)), 2.2, .045, 'triangle', 1100); }
      if (b % 4 === 0) voice(t, HZ(c.root + 12), .34, 'triangle', .17, 700, 0, .01, false);
      // marimba : motif pentatonique qui tourne
      const PENT = [0, 3, 5, 7, 10, 12, 15];
      if (b % 2 === 0 && Math.random() < .8) {
        const deg = PENT[(b / 2 + bar * 3) % PENT.length];
        mallet(t, HZ(c.root + deg + 36), .13, .45);
      }
    },
  },
  // ---- Deep Blue : nappes lentes, sonar, sub ----
  deepblue: {
    bpm: 68, bars: 4,
    chords: [{ root: 0, kind: MIN7 }, { root: 0, kind: MIN7 }, { root: 5, kind: MIN7 }, { root: 3, kind: MAJ7 }],
    step(n, t, bar, beat, c) {
      const b = n % 16;
      if (b === 0) {
        pad(t, c.kind.map(k => HZ(c.root + k + 24)), 3.6, .085, 'sawtooth', 620);
        kick(t, .3);
        voice(t, HZ(c.root), 1.6, 'sine', .22, 300, 0, .05, false);   // sub
      }
      if (b === 8) hat(t, true, .04);
      if (bar % 2 === 1 && b === 12) {                                 // sonar
        voice(t, HZ(24 + 12), 1.4, 'sine', .12, 4000, 0, .004);
        voice(t, HZ(24 + 19), 1.2, 'sine', .07, 4000, 0, .004);
      }
      if (b % 4 === 2 && Math.random() < .35) mallet(t, HZ(c.root + [0, 3, 7, 10, 14][(b + bar) % 5] + 36), .07, .9);
    },
  },
  // ---- Forge : techno industrielle ----
  forge: {
    bpm: 126, bars: 4,
    chords: [{ root: 0, kind: MIN }, { root: 0, kind: MIN }, { root: 10, kind: MIN }, { root: 8, kind: MIN }],
    step(n, t, bar, beat, c) {
      const b = n % 16;
      if (b % 4 === 0) kick(t, .62);
      if (b === 4 || b === 12) snare(t, .26);
      if (b % 2 === 1) hat(t, b === 14, .09);
      if (b === 6 || b === 13) clank(t, .14);                          // marteau sur l'enclume
      // basse saturée en croches
      if (b % 2 === 0) {
        const seq = [0, 0, 12, 0, 3, 0, 10, 0];
        voice(t, HZ(c.root + seq[(b / 2) % 8] + 12), .17, 'sawtooth', .2, 900, 0, .004, false);
      }
      if (b === 0) pad(t, c.kind.map(k => HZ(c.root + k + 24)), 1.6, .04, 'square', 800);
    },
  },
  // ---- Orbital : synthwave ----
  orbital: {
    bpm: 112, bars: 4,
    chords: [{ root: 0, kind: MIN }, { root: 8, kind: MAJ7 }, { root: 5, kind: MIN7 }, { root: 7, kind: DOM7 }],
    step(n, t, bar, beat, c) {
      const b = n % 16;
      if (b === 0 || b === 10) kick(t, .5);
      if (b === 4 || b === 12) snare(t, .3);
      if (b % 2 === 1) hat(t, false, .07);
      if (b % 4 === 0) voice(t, HZ(c.root + 12), .3, 'square', .16, 700, 0, .006, false);
      // arpège en doubles-croches, l'ADN synthwave
      const arp = [0, 3, 7, 12, 15, 12, 7, 3];
      voice(t, HZ(c.root + arp[b % 8] + 36), .13, 'sawtooth', .085, 3200, b % 2 ? 6 : -6);
      if (b === 0) pad(t, c.kind.map(k => HZ(c.root + k + 24)), 2, .05, 'sawtooth', 1400);
    },
  },
  // ---- Après-Minuit : lounge jazzy ----
  minuit: {
    bpm: 88, bars: 4,
    chords: [{ root: 0, kind: MIN7 }, { root: 5, kind: DOM7 }, { root: 10, kind: MAJ7 }, { root: 3, kind: MAJ7 }],
    step(n, t, bar, beat, c) {
      const b = n % 16;
      if (b === 0 || b === 10) kick(t, .3);
      if (b === 4 || b === 12) brush(t, .16);
      // balais : chabada en triolets approchés
      if (b % 2 === 1) brush(t, .05);
      // contrebasse : marche sur les degrés de l'accord
      if (b % 4 === 0) {
        const walk = [0, 7, 3, 10];
        voice(t, HZ(c.root + walk[(b / 4) % 4] + 12), .42, 'triangle', .2, 480, 0, .012, false);
      }
      if (b === 0) pad(t, c.kind.map(k => HZ(c.root + k + 24)), 2.4, .05, 'triangle', 1200);
      // ponctuations de piano électrique
      if ((b === 6 || b === 11) && Math.random() < .6) {
        const vs = c.kind.map(k => HZ(c.root + k + 36));
        vs.forEach((fr, i) => voice(t + i * .012, fr, .5, 'sine', .085, 2600));
      }
    },
  },
};

function scheduler() {
  if (!ctx || !radio || muted) return;
  const eng = STATION_ENGINES[radio.id];
  if (!eng) return;
  const spb = 60 / eng.bpm / 4;                       // durée d'une double-croche
  while (radio.next < ctx.currentTime + .3) {
    const n = radio.step;
    const bar = Math.floor(n / 16) % eng.bars;
    try { eng.step(n, radio.next, bar, Math.floor((n % 16) / 4), eng.chords[bar]); } catch { /* jamais casser le jeu */ }
    radio.step++;
    radio.next += spb;
  }
}

/** Change de station. `floor` sert à la station « ambiance de l'étage ». */
export function setStation(id: string, floor: number) {
  stopRadio();
  stopAmbient();
  if (!ctx || muted) { pendingStation = { id, floor }; return; }
  if (id === 'off') return;
  if (id === 'auto') { setAmbient(floor); return; }
  if (!STATION_ENGINES[id]) return;
  ensureRadioBus();
  radio = { id, timer: null, step: 0, next: ctx.currentTime + .08 };
  radio.timer = setInterval(scheduler, 60);
  scheduler();
}
export function stopRadio() {
  if (radio) { clearInterval(radio.timer); radio = null; }
}
/** Si le son n'est pas encore débloqué (iOS), on retient le choix pour l'appliquer au 1er geste. */
let pendingStation: { id: string; floor: number } | null = null;
export function flushStation() {
  if (!pendingStation || !ctx) return;
  const p = pendingStation; pendingStation = null;
  setStation(p.id, p.floor);
}
