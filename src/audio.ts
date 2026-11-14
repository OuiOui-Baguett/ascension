// ============================================================
// Sons fabriqués à la volée (aucun fichier) : coups, orbe, explosion, plouf,
// saut, ruée, compte à rebours, et le ressac en fond.
// ============================================================
let ctx: AudioContext | null = null, master: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
let muted = false;

export function audioUnlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new AudioContext(); } catch { return; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : .8; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // ressac : bruit filtré qui respire
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
  const g = ctx.createGain(); g.gain.value = .05;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .12; lg.gain.value = .035; lfo.connect(lg); lg.connect(g.gain); lfo.start();
  n.connect(f); f.connect(g); g.connect(master); n.start();
}
export function setMuted(m: boolean) { muted = m; if (master) master.gain.value = m ? 0 : .8; }
export const isMuted = () => muted;

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function noise(dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1, at = 0) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + at, s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, .005, vol, dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + .05);
}
function tone(dur: number, type: OscillatorType, f0: number, f1: number, vol: number, at = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, .006, vol, dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}

export const sfx = {
  swing: () => noise(.12, 'bandpass', 900, 2400, .18, 1.2),
  punch: (big: boolean, near = 1) => { tone(big ? .25 : .14, 'sine', big ? 150 : 190, 45, .7 * near); noise(.1, 'lowpass', 2500, 300, .45 * near); if (big) noise(.35, 'bandpass', 3000, 600, .25 * near, 2); },
  cast: () => { tone(.28, 'sawtooth', 220, 880, .08); tone(.3, 'sine', 440, 1600, .12); noise(.25, 'highpass', 2000, 6000, .06); },
  boom: (near = 1) => { tone(.6, 'sine', 120, 30, .9 * near); noise(.7, 'lowpass', 3000, 120, .7 * near); noise(.25, 'highpass', 4000, 1500, .15 * near); },
  splash: (near = 1) => { noise(.9, 'lowpass', 2600, 250, .55 * near, .8); noise(.4, 'bandpass', 900, 3000, .2 * near, 2, .05); tone(.18, 'sine', 300, 900, .12 * near, .02); },
  jump: () => tone(.12, 'sine', 330, 620, .12),
  dash: () => noise(.22, 'bandpass', 600, 3000, .25, 1.5),
  hurt: () => tone(.2, 'square', 240, 120, .08),
  beep: (hi = false) => tone(hi ? .4 : .15, 'square', hi ? 880 : 520, hi ? 880 : 520, .09),
  ko: () => { tone(.5, 'triangle', 600, 150, .2); tone(.5, 'triangle', 450, 110, .15, .08); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(.3, 'triangle', f, f, .15, i * .12)),
};
