// ============================================================
// Son procédural (aucun fichier) : pluie, gouttes, ronflement de ville ;
// à l'intérieur, pluie étouffée, rumeur feutrée et carillons de machines.
// ============================================================
let ctx: AudioContext | null = null;
let master: GainNode, rainG: GainNode, rainF: BiquadFilterNode, roomG: GainNode, chimeG: GainNode;
let mode: 'street' | 'hall' = 'street';
let muted = false;

function noise(c: AudioContext, sec = 2) {
  const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = w * .6 + last * 3; }
  return b;
}

export function startAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : .8; master.connect(ctx.destination);
  // pluie : bruit large + crépitement aigu
  const src = ctx.createBufferSource(); src.buffer = noise(ctx, 3); src.loop = true;
  rainF = ctx.createBiquadFilter(); rainF.type = 'lowpass'; rainF.frequency.value = 5200;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
  rainG = ctx.createGain(); rainG.gain.value = .32;
  src.connect(hp).connect(rainF).connect(rainG).connect(master); src.start();
  // grondement de ville
  const hum = ctx.createBufferSource(); hum.buffer = noise(ctx, 4); hum.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
  roomG = ctx.createGain(); roomG.gain.value = .5;
  hum.connect(lp).connect(roomG).connect(master); hum.start();
  chimeG = ctx.createGain(); chimeG.gain.value = 0; chimeG.connect(master);
  // gouttes sur la tôle et les auvents
  const drip = () => {
    if (!ctx) return;
    if (mode === 'street' && !muted) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 1800 + Math.random() * 2600; o.type = 'sine';
      g.gain.setValueAtTime(.05 * Math.random(), ctx.currentTime); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .05);
      o.connect(g).connect(master); o.start(); o.stop(ctx.currentTime + .06);
    }
    setTimeout(drip, 40 + Math.random() * 180);
  };
  drip();
  // carillons lointains des machines à sous
  const chime = () => {
    if (!ctx) return;
    if (mode === 'hall' && !muted) {
      const base = [523.25, 659.25, 783.99, 1046.5][Math.floor(Math.random() * 4)];
      for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
        const t = ctx.currentTime + i * .09, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = base * [1, 1.25, 1.5, 2][i % 4];
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.03, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
        o.connect(g).connect(chimeG); o.start(t); o.stop(t + .55);
      }
    }
    setTimeout(chime, 1200 + Math.random() * 3800);
  };
  chime();
  setMode(mode);
}

export function setMode(m: 'street' | 'hall') {
  mode = m;
  if (!ctx) return;
  const t = ctx.currentTime;
  rainG.gain.setTargetAtTime((m === 'street' ? .32 : .07) * ambient, t, .6);
  rainF.frequency.setTargetAtTime(m === 'street' ? 5200 : 420, t, .6);
  roomG.gain.setTargetAtTime((m === 'street' ? .5 : .85) * ambient, t, .6);
  chimeG.gain.setTargetAtTime((m === 'hall' ? 1 : 0) * ambient, t, .6);
}

export function setMuted(v: boolean) { muted = v; if (ctx) master.gain.setTargetAtTime(v ? 0 : .8, ctx.currentTime, .1); }
export function isMuted() { return muted; }

// ---------- voix (ElevenLabs) ----------
const BASE = import.meta.env.BASE_URL + 'res/voix/';
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let voiceG: GainNode | null = null, narr: AudioBufferSourceNode | null = null, ambient = 1;
function load(name: string) {
  if (!buffers.has(name)) buffers.set(name, fetch(BASE + name + '.mp3').then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => ctx!.decodeAudioData(b)).catch(() => null));
  return buffers.get(name)!;
}
/** Précharge des voix (évite le petit blanc à la première lecture). */
export function preloadVoices(names: string[]) { if (ctx) for (const n of names) load(n); }
/** Joue une réplique. pos/listener : atténuation avec la distance (croupier, caissière). */
export async function voice(name: string, o: { gain?: number; pos?: { x: number; z: number }; listener?: { x: number; z: number }; narration?: boolean } = {}) {
  if (!ctx) return 0;
  voiceG ??= (() => { const g = ctx!.createGain(); g.gain.value = 1; g.connect(master); return g; })();
  const buf = await load(name);
  if (!buf || !ctx) return 0;
  let gain = o.gain ?? 1;
  if (o.pos && o.listener) { const d = Math.hypot(o.pos.x - o.listener.x, o.pos.z - o.listener.z); gain *= Math.max(0, 1 - d / 14); if (gain < .03) return 0; }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(g).connect(voiceG);
  if (o.narration) {
    narr?.stop(); narr = src;
    duck(.35);
    src.onended = () => { if (narr === src) { narr = null; duck(1); } };
  }
  src.start();
  return buf.duration;
}
export const audioReady = () => !!ctx && ctx.state === 'running';
export function stopNarration() { try { narr?.stop(); } catch { /* déjà fini */ } narr = null; duck(1); }
/** Baisse l'ambiance (pluie, salle) pendant que le maître de jeu parle. */
function duck(v: number) {
  ambient = v;
  if (!ctx) return;
  for (const g of [rainG, roomG, chimeG]) g?.gain.cancelScheduledValues(ctx.currentTime);
  setMode(mode);
}
