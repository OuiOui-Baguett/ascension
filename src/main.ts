// ============================================================
// LE CASSE — écran d'accueil (rue sous la pluie), parties par code, cinématique
// d'entrée, puis tout le monde dans le Grand Casino, en vue à l'épaule.
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
import { startAudio, setMode, setMuted, isMuted, voice, stopNarration } from './audio';
import { Tuto } from './tuto';
import { Net, LOCAL } from './net';
import { Body, Remotes, CHARACTER } from './player';
import { Play } from './play';
import type { ServerMsg } from '../shared/protocol';

type Lobby = Extract<ServerMsg, { t: 'lobby' }>;
type Night = Extract<ServerMsg, { t: 'started' }>;

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const params = new URLSearchParams(location.search);
const canvas = $('#c') as HTMLCanvasElement;

const boot = new THREE.PerspectiveCamera();
const renderer = createEngine(canvas, new THREE.Scene(), boot, onQuality);
renderer.setClearColor('#050507');
renderer.info.autoReset = false;

let street: World, hall: World | null = null, world: World;
let state: 'loading' | 'title' | 'enter' | 'cine' | 'explore' | 'tuto' = 'loading';
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
  if (pendingNight) { const n = pendingNight; pendingNight = null; onStarted(n); }
  // première visite : le maître de jeu se présente tout seul (on peut passer)
  let seen = false; try { seen = !!localStorage.getItem('casse.tuto'); } catch { /* stockage indisponible */ }
  $('#tuto-btn').classList.toggle('new', !seen);
  if (!seen && state === 'title' && !params.has('clean') && !params.has('notuto')) setTimeout(() => { if (state === 'title' && !lobby) startTuto(); }, 2500);
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
  if (state === 'cine') { if (i > 0) dip(); typewrite(s.text ?? ''); voice(`cine_${i}`, { narration: true }); }
  else if ((state === 'title' || state === 'tuto') && i > 0) dip();
};

// ---------- le maître de jeu ----------
const tuto = new Tuto(director, () => endTuto());
async function startTuto() {
  if (state !== 'title') return;
  startAudio();
  $('#title').classList.add('hidden');
  director.stop();
  await fade(1, .5);
  await ensureHall();
  if (state !== 'title') return;
  switchTo(hall!); setMode('hall');
  state = 'tuto';
  document.body.classList.add('cine');
  setDof(getQuality() !== 'low');
  tuto.start();
  fade(0, .9);
}
async function endTuto() {
  if (state !== 'tuto') return;
  await fade(1, .5);
  if (state !== 'tuto') return;
  switchTo(street); setMode('street');
  showTitle();
  fade(0, .9);
}
/** Une nuit démarre pendant l'explication : on coupe tout de suite. */
function abortTuto() {
  tuto.stop(false); stopNarration();
  switchTo(street); state = 'title';
}

// ---------- états ----------
function showTitle() {
  state = 'title';
  document.body.classList.remove('cine');
  if (!params.has('clean')) $('#title').classList.remove('hidden');
  renderMenu();
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
    setupNight();
    director.play(hall!.shots, false, startExplore);
    fade(0, .9);
  });
}

function startExplore() {
  if (state === 'explore') return;
  const fromCine = state === 'cine';
  state = 'explore';
  director.stop();
  if (fromCine) stopNarration();
  const go = () => {
    document.body.classList.remove('cine');
    $('#skip').classList.add('hidden');
    clearInterval(typeTimer); $('#sub').textContent = '';
    $('#hud').classList.remove('hidden');
    setTimeout(() => $('#help').classList.add('hidden'), 6000);
    setDof(false);
    setupNight();
    const me = night?.pos.find(p => p[0] === net.id);
    const sp = hall!.spawn!.pos;
    walker.place(me ? me[1] : sp[0], me ? me[2] : sp[2], Math.PI);
    walker.active = true;
    if (night) play.start(night.elapsed + performance.now() - nightAt, night.dur);
    const av = night?.players.find(p => p.id === net.id)?.avatar;
    if (av && !night?.rejoin) toast(`Ce soir, tu joues`, CHARACTER[av] ?? '');
  };
  if (fromCine) { fade(1, .35).then(() => { go(); fade(0, .6); }); } else go();
}

async function backToStreet() {
  walker.active = false;
  teardownNight();
  await fade(1, .5);
  switchTo(street);
  showTitle();
  fade(0, .9);
}

// ---------- réseau : salon et nuit ----------
const net = new Net();
let lobby: Lobby | null = null, night: Night | null = null, pendingNight: Night | null = null;
let remotes: Remotes | null = null, myBody: Body | null = null, nightSeed = -1, nightAt = 0;
const play = new Play({
  net, walker, cam: () => world.camera, scene: () => hall?.scene ?? null, body: () => myBody, remotes: () => remotes,
  names: () => new Map((lobby?.players ?? []).map(p => [p.id, p.name])),
  toast: (a, b) => toast(a, b), error: m => showError(m),
});

net.onStatus = s => {
  const el = $('#net');
  el.textContent = s === 'connecting' ? 'Connexion au serveur…' : 'Connexion perdue — on réessaie…';
  el.classList.toggle('hidden', s === 'online' || state === 'loading');
};
net.onMsg = m => {
  if (play.onMsg(m)) return;
  switch (m.t) {
    case 'lobby':
      lobby = m;
      if (m.phase === 'night' && night) remotes?.sync(m.players, net.id);
      if (m.phase === 'lobby' && night) { night = null; }
      renderMenu(); updateBadge();
      break;
    case 'started': onStarted(m); break;
    case 'snap': remotes?.snap(m.p, net.id); break;
    case 'gone': remotes?.remove(m.id); break;
    case 'left': lobby = null; night = null; if (state === 'explore' || state === 'cine') backToStreet(); else renderMenu(); break;
    case 'error': showError(m.msg); break;
  }
};

function onStarted(m: Night) {
  if (state === 'loading') { pendingNight = m; return; }
  const same = m.seed === nightSeed;
  night = m; nightAt = performance.now();
  if (same && (state === 'explore' || state === 'cine' || state === 'enter')) {
    // simple reconnexion : on garde sa position, on remet les autres à jour
    remotes?.sync(m.players, net.id);
    return;
  }
  nightSeed = m.seed;
  if (m.rejoin) {
    // retour en pleine nuit (page rechargée) : directement dans le casino
    (async () => {
      $('#title').classList.add('hidden'); director.stop();
      await fade(1, .3); await ensureHall(); switchTo(hall!); setMode('hall');
      teardownNight(); state = 'cine'; startExplore(); fade(0, .8);
    })();
  } else if (state === 'title' || state === 'tuto') { if (state === 'tuto') abortTuto(); teardownNight(); enterCasino(); }
}

/** Crée les corps des joueurs dans le casino (une fois par nuit). */
function setupNight() {
  if (!night || !hall || myBody) return;
  remotes = new Remotes(hall.scene);
  remotes.sync(night.players, net.id);
  for (const [id, x, z, yaw] of night.pos) remotes.place(id, x, z, yaw);
  const me = night.players.find(p => p.id === net.id);
  if (me?.avatar) {
    myBody = new Body(me.avatar, null, hall.scene);
    const p = night.pos.find(q => q[0] === net.id);
    if (p) { myBody.holder.position.set(p[1], 0, p[2]); myBody.holder.rotation.y = Math.PI; myBody.animate(0, 0); }
    walker.body = myBody;
  }
  updateBadge();
}
function teardownNight() {
  play.stop();
  remotes?.clear(); remotes = null;
  myBody?.dispose(); myBody = null; walker.body = null;
}

// envoi de sa position au serveur, ~15 fois par seconde
let sendAcc = 0, lastSent = '', lastSentAt = 0;
function sendInput(dt: number, now: number) {
  sendAcc += dt;
  if (sendAcc < .066 || !night || state !== 'explore') return;
  sendAcc = 0;
  const x = +walker.pos.x.toFixed(2), z = +walker.pos.z.toFixed(2), yaw = +walker.bodyYaw.toFixed(2);
  const mv = walker.speed > 2.5 ? 2 : walker.speed > .2 ? 1 : 0;
  const key = `${x},${z},${yaw},${mv}`;
  if (play.mode === 'slot') return;
  if (key === lastSent && now - lastSentAt < 1000) return;
  lastSent = key; lastSentAt = now;
  net.send({ t: 'input', x, z, yaw, mv });
}

function renderMenu() {
  const inLobby = !!lobby;
  $('#v-home').classList.toggle('hidden', inLobby);
  $('#v-lobby').classList.toggle('hidden', !inLobby);
  $('#join-row').style.display = LOCAL ? 'none' : '';
  $('#home-note').innerHTML = LOCAL
    ? 'Version d\'aperçu : pas de serveur ici, tu joues avec des bots. Pour jouer à plusieurs, il faut la version hébergée.<br>Personnages : Microsoft Rocketbox (MIT)'
    : 'Crée une partie et envoie le code à tes potes, ou entre le leur.<br>Personnages : Microsoft Rocketbox (MIT)';
  if (!lobby) return;
  const host = lobby.host === net.id;
  $('.dossier').classList.toggle('guest', !host);
  $('#l-code').textContent = LOCAL ? 'SOLO' : lobby.code;
  $('#l-players').innerHTML = lobby.players.map(p =>
    `<li class="${p.online ? '' : 'off'} ${p.id === net.id ? 'me' : ''}">${p.id === lobby!.host ? '★ ' : ''}${esc(p.name)}${p.id === net.id ? ' <i>toi</i>' : ''}${p.bot ? ' <i>bot</i>' : ''}${p.online ? '' : ' <i>déco</i>'}</li>`).join('');
  $('#l-ind').textContent = String(lobby.settings.indics);
  document.querySelectorAll<HTMLButtonElement>('#l-dur button').forEach(b => b.classList.toggle('on', b.dataset.d === lobby!.settings.duree));
  ($('#start') as HTMLButtonElement).style.display = host ? '' : 'none';
  ($('#addbot') as HTMLButtonElement).style.display = host ? '' : 'none';
  ($('#addbot') as HTMLButtonElement).disabled = lobby.players.length >= 8;
  const n = lobby.players.length;
  const hostName = lobby.players.find(p => p.id === lobby!.host)?.name ?? 'l\'hôte';
  $('#l-note').textContent = !host ? `En attente que ${hostName} lance la nuit…`
    : n < 3 ? `${n} joueur${n > 1 ? 's' : ''} : il en faut 3 pour une vraie partie. Pour tester, tu peux lancer quand même ou ajouter des bots.`
    : `Équipe au complet ? Lance la nuit. Les indics restent secrets (rôles à l'étape suivante).`;
}
function updateBadge() {
  const n = lobby?.players.length ?? 0;
  $('#badge').innerHTML = lobby ? `${LOCAL ? 'Aperçu solo' : 'Partie ' + lobby.code} · ${n} joueur${n > 1 ? 's' : ''}` : '';
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
let errTimer = 0;
function showError(msg: string) {
  const el = $('#err'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(errTimer); errTimer = window.setTimeout(() => el.classList.add('hidden'), 3500);
}
let toastTimer = 0;
function toast(line: string, big: string) {
  const el = $('#toast'); el.innerHTML = `${line}<b>${esc(big)}</b>`; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove('on'), 3800);
}

// ---------- interface ----------
const nameInput = $('#name') as HTMLInputElement, codeInput = $('#code') as HTMLInputElement;
nameInput.value = net.name;
function takeName() {
  let n = nameInput.value.trim();
  if (!n) { n = 'Joueur ' + (10 + Math.floor(Math.random() * 90)); nameInput.value = n; }
  if (n !== net.name) net.setName(n);
}
$('#create').onclick = () => { startAudio(); takeName(); net.send({ t: 'create' }); };
$('#join').onclick = () => {
  startAudio();
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 4) { showError('Le code fait 4 lettres.'); codeInput.focus(); return; }
  takeName(); net.send({ t: 'join', code });
};
codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') $('#join').click(); });
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });
nameInput.addEventListener('change', () => { if (nameInput.value.trim()) net.setName(nameInput.value.trim()); });
document.querySelectorAll<HTMLButtonElement>('[data-ind]').forEach(b => b.onclick = () => {
  if (lobby) net.send({ t: 'settings', indics: lobby.settings.indics + +b.dataset.ind! });
});
document.querySelectorAll<HTMLButtonElement>('#l-dur button').forEach(b => b.onclick = () => net.send({ t: 'settings', duree: b.dataset.d as any }));
$('#addbot').onclick = () => net.send({ t: 'bot' });
$('#tuto-btn').onclick = () => startTuto();
$('#tuto-btn2').onclick = () => startTuto();
$('#start').onclick = () => { startAudio(); net.send({ t: 'start' }); };
$('#leave').onclick = () => net.send({ t: 'leave' });
let quitArmed = 0;
$('#back').onclick = () => {
  // deux appuis pour quitter : pas de sortie accidentelle en pleine nuit
  if (!quitArmed) {
    $('#back').textContent = 'Sûr ? Quitter la partie';
    quitArmed = window.setTimeout(() => { quitArmed = 0; $('#back').textContent = 'Quitter'; }, 3000);
    return;
  }
  clearTimeout(quitArmed); quitArmed = 0; $('#back').textContent = 'Quitter';
  net.send({ t: 'leave' });
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') net.wake(); });
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
    if (world === hall) { remotes?.update(dt); if (!walker.active && myBody) myBody.animate(0, dt); play.update(dt); }
    sendInput(dt, now);
    if (state === 'title') focusDof(director.focus, 14);
    else if (state === 'cine' || state === 'tuto') focusDof(director.focus, Math.max(3, director.focus * .7));
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
(window as any).__walk = (x: number, z: number, yaw: number, pitch = .2) => { walker.pos.set(x, 0, z); walker.yaw = yaw; walker.pitch = pitch; walker.bodyYaw = yaw + Math.PI; };
(window as any).__net = () => ({ id: net.id, status: net.status, lobby, night: !!night, remotes: remotes?.map.size ?? 0, me: [walker.pos.x, walker.pos.z], state });
(window as any).__keys = walker.keys;
(window as any).__play = play;
(window as any).__remote = (id: string) => { const r = remotes?.map.get(id); return r && [+r.body.holder.position.x.toFixed(2), +r.body.holder.position.z.toFixed(2), +r.body.speed.toFixed(2)]; };
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
net.connect();
start();
