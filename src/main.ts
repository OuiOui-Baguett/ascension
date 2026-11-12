// ============================================================
// LE CASSE — test de rendu : écran d'accueil (rue sous la pluie), cinématique
// d'entrée, hall du Grand Casino en marche libre.
// ============================================================
import './safe-storage';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/special-elite/latin-400.css';
import '@fontsource/monoton/latin-400.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import './style.css';
import * as THREE from 'three';
import {
  createEngine, applyLook, render, resizeEngine, watchPerf, setScene, setDof, focusDof, getQuality, setQuality, touchDevice, type Quality,
} from './gfx/engine';
import { preload } from './gfx/assets';
import { tickAll } from './gfx/kit';
import { buildStreet } from './world/street';
import { buildHall } from './world/hall';
import type { World } from './world/world';
import { Director, Rail, Walker } from './cam';
import { startAudio, setMode, setMuted, isMuted } from './audio';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const params = new URLSearchParams(location.search);
const canvas = $('#c') as HTMLCanvasElement;

const boot = new THREE.PerspectiveCamera();
const renderer = createEngine(canvas, new THREE.Scene(), boot, onQuality);
renderer.setClearColor('#050507');
renderer.info.autoReset = false;

let street: World, hall: World | null = null, world: World;
let state: 'loading' | 'title' | 'enter' | 'cine' | 'explore' = 'loading';
let qualityMode: 'auto' | Quality = (params.get('quality') as Quality) ?? 'auto';
const mirrorScale = (q: Quality) => (q === 'high' ? .5 : q === 'medium' ? .36 : .3);

function onQuality(q: Quality) {
  for (const w of [street, hall]) if (w) { w.mirror.scale = mirrorScale(q); w.mirror.setEnabled(q !== 'low'); }
  updateQualityLabel();
}

// ---------- chargement ----------
async function start() {
  const bar = $('.ld-bar i'), txt = $('.ld-txt b');
  await Promise.all(['100px Monoton', '100px "Bebas Neue"', '20px "Special Elite"', '100px "Playfair Display"', 'italic 100px "Playfair Display"']
    .map(f => document.fonts.load(f).catch(() => null)));
  await preload(p => { bar.style.width = (p * 100).toFixed(0) + '%'; txt.textContent = Math.round(p * 100) + ' %'; }, renderer.capabilities.getMaxAnisotropy());
  street = buildStreet(renderer, getQuality());
  onQuality(getQuality());
  const view = params.get('view');
  if (view === 'hall') { await ensureHall(); switchTo(hall!); }
  else switchTo(street);
  renderer.compile(world.scene, world.camera);
  $('#loader').classList.add('hidden');
  setTimeout(() => $('#loader').remove(), 1000);
  fade(0, 1.4);
  if (view === 'hall') startExplore();
  else showTitle();
}

async function ensureHall() {
  if (hall) return;
  $('#wait').classList.remove('hidden');
  await new Promise(r => setTimeout(r, 30));
  hall = buildHall(renderer, getQuality());
  hall.camera.aspect = innerWidth / innerHeight; hall.camera.updateProjectionMatrix();
  onQuality(getQuality());
  renderer.compile(hall.scene, hall.camera);
  $('#wait').classList.add('hidden');
}

function switchTo(w: World) {
  world = w;
  w.camera.aspect = innerWidth / innerHeight; w.camera.updateProjectionMatrix();
  director.cam = rail.cam = walker.cam = w.camera;
  setScene(w.scene, w.camera, w.hooks);
  applyLook(w.look);
}

// ---------- caméras ----------
const director = new Director(boot);
let rail = new Rail(boot, [[0, 0, 0], [0, 0, 1]], 1, [0, 0, 0]);
const walker = new Walker(boot, canvas, { base: $('#joy'), knob: $('#joy i') });
director.onShot = (s, i) => {
  if (state === 'cine') { if (i > 0) dip(); typewrite(s.text ?? ''); }
  else if (state === 'title' && i > 0) dip();
};

// ---------- états ----------
function showTitle() {
  state = 'title';
  document.body.classList.remove('cine');
  if (!params.has('clean')) $('#title').classList.remove('hidden');
  $('#hud').classList.add('hidden');
  $('#skip').classList.add('hidden');
  $('#sub').textContent = '';
  walker.active = false;
  street.enterTick?.(0);
  setDof(getQuality() !== 'low');
  setMode('street');
  const fixed = params.get('shot');
  if (fixed !== null) {
    const s = street.shots[+fixed];
    director.play([{ ...s, from: s.to, dur: 9999 }], true);
  } else director.play(street.shots, true);
}

async function enterCasino() {
  if (state !== 'title') return;
  startAudio();
  state = 'enter';
  $('#title').classList.add('hidden');
  document.body.classList.add('cine');
  director.stop();
  rail = new Rail(world.camera, street.enter!, 8.5, [0, 3.4, -21]);
  rail.start(async () => {
    await fade(1, .45);
    await ensureHall();
    switchTo(hall!);
    setMode('hall');
    state = 'cine';
    $('#skip').classList.remove('hidden');
    director.play(hall!.shots, false, startExplore);
    fade(0, .9);
  });
}

function startExplore() {
  if (state === 'explore') return;
  const fromCine = state === 'cine';
  state = 'explore';
  director.stop();
  const go = () => {
    document.body.classList.remove('cine');
    $('#skip').classList.add('hidden');
    $('#sub').textContent = '';
    $('#hud').classList.remove('hidden');
    setTimeout(() => $('#help').classList.add('hidden'), 6000);
    setDof(false);
    walker.place(hall!);
    walker.active = true;
  };
  if (fromCine) { fade(1, .35).then(() => { go(); fade(0, .6); }); } else go();
}

async function backToStreet() {
  if (state !== 'explore') return;
  walker.active = false;
  await fade(1, .5);
  switchTo(street);
  showTitle();
  fade(0, .9);
}

// ---------- interface ----------
$('#go').onclick = () => enterCasino();
$('#back').onclick = () => backToStreet();
$('#snd').onclick = () => { startAudio(); setMuted(!isMuted()); $('#snd b').textContent = isMuted() ? 'Non' : 'Oui'; };
$('#q').onclick = () => {
  const order: ('auto' | Quality)[] = ['auto', 'high', 'medium', 'low'];
  qualityMode = order[(order.indexOf(qualityMode) + 1) % order.length];
  setQuality(qualityMode === 'auto' ? (touchDevice ? 'medium' : 'high') : qualityMode);
  if (state === 'title') setDof(getQuality() !== 'low');
  updateQualityLabel();
};
function updateQualityLabel() {
  const names: Record<string, string> = { auto: 'Auto', high: 'Haute', medium: 'Moyenne', low: 'Basse' };
  const el = $('#q b'); if (el) el.textContent = names[qualityMode] + (qualityMode === 'auto' ? ` (${names[getQuality()]})` : '');
}
canvas.addEventListener('pointerdown', () => {
  startAudio();
  if (state === 'cine') { director.stop(); startExplore(); }
});
addEventListener('resize', () => {
  for (const w of [street, hall]) if (w) { w.camera.aspect = innerWidth / innerHeight; w.camera.updateProjectionMatrix(); }
  resizeEngine();
});

function fade(to: number, sec: number) {
  const f = $('#fade');
  f.style.transition = `opacity ${sec}s`;
  f.style.opacity = String(to);
  return new Promise<void>(r => setTimeout(r, sec * 1000 + 30));
}
function dip() { const f = $('#fade'); f.classList.remove('dip'); void f.offsetWidth; f.classList.add('dip'); }
let typeTimer = 0;
function typewrite(text: string) {
  const el = $('#sub');
  clearInterval(typeTimer); el.textContent = '';
  let i = 0;
  typeTimer = window.setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typeTimer); }, 38);
}

// ---------- boucle ----------
let last = performance.now(), time = 0, frames = 0;
const stillN = +(params.get('still') ?? 0);
function frame(now: number) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  time += stillN ? 1 / 30 : dt;
  if (world) {
    tickAll(time, dt);
    director.update(stillN ? 1 / 30 : dt, time);
    rail.update(dt);
    walker.update(dt, world);
    if (state === 'title') focusDof(director.focus, 14);
    else if (state === 'cine') focusDof(director.focus, Math.max(3, director.focus * .7));
    else if (state === 'enter') { street.enterTick?.(rail.progress); focusDof(Math.max(2, world.camera.position.distanceTo(new THREE.Vector3(0, 2.4, -21))), 7); }
    renderer.info.reset();
    render(dt);
    watchPerf(now);
    if (stillN && ++frames === stillN) (window as any).__still = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as any).__gfx = () => ({ q: getQuality(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, state });
(window as any).__walk = (x: number, z: number, yaw: number, pitch = 0) => { walker.pos.set(x, 1.65, z); walker.yaw = yaw; walker.pitch = pitch; };
(window as any).__enter = () => enterCasino();
(window as any).__railAt = (k: number) => {
  if (world !== street) switchTo(street);
  director.stop(); state = 'enter'; $('#title').classList.add('hidden'); document.body.classList.add('cine');
  rail = new Rail(world.camera, street.enter!, 8.5, [0, 3.4, -21]); rail.start(() => {}); rail.hold = true;
  const target = k; let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; const e = m < .5 ? 2 * m * m : 1 - Math.pow(-2 * m + 2, 2) / 2; if (e < target) lo = m; else hi = m; }
  rail.t = lo * 9; rail.update(0);
};
(window as any).__look = async (x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 55) => {
  await ensureHall(); if (world !== hall) switchTo(hall!);
  state = 'cine'; walker.active = false; $('#hud').classList.add('hidden'); document.body.classList.add('cine');
  const f = Math.hypot(tx - x, ty - y, tz - z);
  director.play([{ from: [x, y, z], to: [x, y, z], look: [tx, ty, tz], look2: [tx, ty, tz], fov, dur: 9999, focus: f }], true); setDof(getQuality() !== 'low');
};
(window as any).__hshot = async (i: number) => {
  await ensureHall(); if (world !== hall) switchTo(hall!);
  state = 'cine'; walker.active = false; $('#hud').classList.add('hidden'); document.body.classList.add('cine');
  const s = hall!.shots[i]; director.play([{ ...s, from: s.to, dur: 9999 }], true); setDof(getQuality() !== 'low');
};
start();
