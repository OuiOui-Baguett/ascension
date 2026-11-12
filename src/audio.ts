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
  rainG.gain.setTargetAtTime(m === 'street' ? .32 : .07, t, .6);
  rainF.frequency.setTargetAtTime(m === 'street' ? 5200 : 420, t, .6);
  roomG.gain.setTargetAtTime(m === 'street' ? .5 : .85, t, .6);
  chimeG.gain.setTargetAtTime(m === 'hall' ? 1 : 0, t, .6);
}

export function setMuted(v: boolean) { muted = v; if (ctx) master.gain.setTargetAtTime(v ? 0 : .8, ctx.currentTime, .1); }
export function isMuted() { return muted; }
