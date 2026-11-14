// ============================================================
// Naufragés — le jeu dans la page : menus, combat à la première personne, HUD.
// ============================================================
import '@fontsource/lilita-one';
import './style.css';
import * as THREE from 'three';
import { Engine } from './engine';
import { buildWorld } from './world';
import { FX } from './fx';
import { Fighter, Viewmodel, colorOf, COLORS, pctColor } from './avatars';
import { Input } from './input';
import { Net, LOCAL } from './net';
import { audioUnlock, sfx, setMuted, isMuted } from './audio';
import { MOVE, PUNCH, BLAST, RESPAWN_MS, newBody, stepBody } from '../shared/fight';
import { terrainH } from '../shared/island';
import type { PlayerInfo, ServerMsg } from '../shared/protocol';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const params = new URLSearchParams(location.search);

// ---------- scène ----------
const canvas = $('#c') as HTMLCanvasElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, .05, 900);
scene.add(camera);
const engine = new Engine(canvas, scene, camera);
const world = buildWorld(scene, engine.quality);
const fx = new FX(scene);
const input = new Input(canvas, $('#joy'), $('#joy i'));
for (const [id, a] of [['#b-punch', 'punch'], ['#b-blast', 'blast'], ['#b-jump', 'jump'], ['#b-dash', 'dash']]) input.bindButton($(id), a);
const net = new Net();

// ---------- état ----------
type Screen = 'title' | 'lobby' | 'play';
let screen: Screen = 'title';
let lobby: Extract<ServerMsg, { t: 'lobby' }> | null = null;
let training = 0;          // bots à ajouter automatiquement (bouton « S'entraîner »)
interface Other { info: PlayerInfo; f: Fighter | null; buf: { t: number; x: number; y: number; z: number; yaw: number; st: number }[]; pct: number; lives: number; last: THREE.Vector3; st: number }
const others = new Map<string, Other>();
const me = {
  body: newBody(0, 1, 0), yaw: 0, pitch: 0, alive: false, out: false, shield: 0, cdPunch: 0, cdBlast: 0, seq: 0, color: 0,
  startAt: 0, sendT: 0, deadT: 0, deadX: 0, deadZ: 0, pct: 0, lives: 3, count: -1,
};
let vm: Viewmodel | null = null;
let shake = 0, hurt = 0, fov = 78;
interface Proj { orb: ReturnType<FX['orb']>; x: number; y: number; z: number; dx: number; dy: number; dz: number; until: number; color: THREE.Color }
const projs = new Map<string, Proj>();
const pidKey = new Map<number, string>();

// ---------- petits outils d'interface ----------
let toastT = 0;
function toast(msg: string) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('on'), 2600); }
let centerT = 0;
function center(big: string, small = '', ms = 1400) {
  const c = $('#center'); (c.querySelector('b') as HTMLElement).textContent = big; (c.querySelector('span') as HTMLElement).textContent = small;
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('on', 'pop');
  clearTimeout(centerT); if (ms > 0) centerT = window.setTimeout(() => c.classList.remove('on'), ms);
}
function show(s: 'title' | 'lobby' | 'end' | 'play') {
  for (const id of ['#title', '#lobby', '#end']) $(id).classList.add('hidden');
  $('#hud').classList.toggle('hidden', s !== 'play' && s !== 'end');
  if (s !== 'play') $('#' + s).classList.remove('hidden');
}
const nameOf = (id: string | null) => (id && others.get(id)?.info.name) || '?';
const colorHex = (id: string) => COLORS[(others.get(id)?.info.color ?? 0) % COLORS.length];

// ---------- menus ----------
const nameIn = $('#name') as HTMLInputElement;
nameIn.value = net.name;
nameIn.addEventListener('change', () => net.setName(nameIn.value.trim() || 'Naufragé'));
function begin() {
  audioUnlock();
  if (nameIn.value.trim() && nameIn.value.trim() !== net.name) net.setName(nameIn.value.trim());
  if (input.touch) { document.documentElement.requestFullscreen?.().catch(() => {}); (window.screen as any).orientation?.lock?.('landscape')?.catch?.(() => {}); }
}
$('#train').onclick = () => { begin(); training = 3; net.send({ t: 'create' }); };
$('#create').onclick = () => { begin(); training = 0; net.send({ t: 'create' }); };
$('#join').onclick = () => { begin(); const c = ($('#code') as HTMLInputElement).value.trim().toUpperCase(); if (c.length === 4) net.send({ t: 'join', code: c }); else toast('Le code fait 4 lettres.'); };
$('#snd').onclick = () => { setMuted(!isMuted()); $('#snd').textContent = `Son : ${isMuted() ? 'non' : 'oui'}`; };
$('#addbot').onclick = () => net.send({ t: 'bot', add: true });
$('#rmbot').onclick = () => net.send({ t: 'bot', add: false });
$('#leave').onclick = () => { net.send({ t: 'leave' }); lobby = null; show('title'); screen = 'title'; };
$('#start').onclick = () => { audioUnlock(); net.send({ t: 'start' }); };
document.querySelectorAll<HTMLElement>('[data-l]').forEach(b => b.onclick = () => { if (lobby) net.send({ t: 'settings', lives: lobby.settings.lives + +b.dataset.l! }); });
$('#again').onclick = () => { audioUnlock(); net.send({ t: 'start' }); };
$('#toLobby').onclick = () => { endMatch(); show('lobby'); };
$('#quit').onclick = () => { endMatch(); net.send({ t: 'leave' }); lobby = null; show('title'); };

function renderLobby() {
  if (!lobby) return;
  const host = lobby.players.find(p => p.host)?.id === net.id;
  $('#l-code').textContent = LOCAL ? 'SOLO' : lobby.code;
  $('#l-players').innerHTML = lobby.players.map(p => `<li style="--c:${COLORS[p.color % 8]}"><i></i>${esc(p.name)}${p.id === net.id ? ' <small>toi</small>' : p.bot ? ' <small>bot</small>' : p.host ? ' <small>hôte</small>' : ''}</li>`).join('');
  $('#l-lives').textContent = String(lobby.settings.lives);
  for (const id of ['#addbot', '#rmbot', '#start']) ($(id) as HTMLButtonElement).disabled = !host;
  document.querySelectorAll<HTMLButtonElement>('[data-l]').forEach(b => b.disabled = !host);
  $('#l-note').textContent = host ? (lobby.players.length < 2 ? 'Il faut au moins 2 combattants : invite un pote ou ajoute un bot.' : 'Tout le monde est là ? Lance la baston.') : 'En attente de l\'hôte…';
  ($('#again') as HTMLButtonElement).classList.toggle('hidden', !host);
}

// ---------- la manche ----------
function setupMatch(m: Extract<ServerMsg, { t: 'start' }>) {
  endMatch();
  screen = 'play'; show('play'); $('#end').classList.add('hidden');
  for (const p of m.players) {
    const o: Other = { info: p, f: p.id === net.id ? null : new Fighter(scene, p.name, p.color), buf: [], pct: 0, lives: m.lives, last: new THREE.Vector3(), st: 0 };
    others.set(p.id, o);
  }
  const mine = m.players.find(p => p.id === net.id);
  me.color = mine?.color ?? 0;
  vm = new Viewmodel(camera, me.color);
  me.body = newBody(m.spawn.x, m.spawn.y, m.spawn.z); me.yaw = m.spawn.yaw; me.pitch = -.05;
  me.alive = true; me.out = false; me.shield = 0; me.cdPunch = me.cdBlast = 0; me.pct = 0; me.lives = m.lives;
  me.startAt = performance.now() + m.at; me.count = -1;
  input.clear(); input.enabled = true;
  renderCards();
}
function endMatch() {
  for (const o of others.values()) o.f?.dispose();
  others.clear();
  for (const p of projs.values()) p.orb.dispose();
  projs.clear(); pidKey.clear();
  if (vm) { camera.remove(vm.group); vm = null; }
  input.enabled = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('#center').classList.remove('on');
}
function renderCards() {
  $('#cards').innerHTML = [...others.values()].map(o => {
    const out = o.lives <= 0;
    return `<div class="pcard${o.info.id === net.id ? ' me' : ''}${out ? ' out' : ''}" style="--c:${COLORS[o.info.color % 8]}"><small>${esc(o.info.id === net.id ? 'Toi' : o.info.name)}</small><b style="color:${pctColor(o.pct)}">${out ? 'K.O.' : o.pct + '%'}</b><em>${'♥'.repeat(Math.max(0, o.lives))}</em></div>`;
  }).join('');
  const b = $('#mypct');
  (b.querySelector('b') as HTMLElement).textContent = me.out ? 'Éliminé' : `${me.pct} %`;
  (b.querySelector('b') as HTMLElement).style.color = pctColor(me.pct);
  (b.querySelector('span') as HTMLElement).textContent = '♥'.repeat(Math.max(0, me.lives));
}
function feed(html: string) {
  const d = document.createElement('div'); d.innerHTML = html; $('#feed').prepend(d);
  setTimeout(() => d.remove(), 4600);
  while ($('#feed').children.length > 4) $('#feed').lastElementChild!.remove();
}
const nearMe = (x: number, z: number) => Math.max(.15, 1 - Math.hypot(x - me.body.x, z - me.body.z) / 30);
const fwd = (yaw: number, pitch: number) => new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

function addProj(key: string, x: number, y: number, z: number, dx: number, dy: number, dz: number, color: THREE.Color) {
  projs.get(key)?.orb.dispose();
  projs.set(key, { orb: fx.orb(color), x, y, z, dx, dy, dz, until: performance.now() + BLAST.life * 1000 + 300, color });
}

// ---------- réseau ----------
net.onMsg = m => {
  switch (m.t) {
    case 'lobby': {
      lobby = m;
      const host = m.players.find(p => p.host)?.id === net.id;
      if (training > 0 && host && m.phase === 'lobby') {
        if (m.players.length < 1 + training) { net.send({ t: 'bot', add: true }); return; }
        training = 0; net.send({ t: 'start' }); return;
      }
      renderLobby();
      if (screen !== 'play') { screen = 'lobby'; show('lobby'); }
      break;
    }
    case 'start': setupMatch(m); break;
    case 'snap': {
      const t = performance.now();
      for (const [id, x, y, z, yaw, , st] of m.p) {
        const o = others.get(id); if (!o || id === net.id) continue;
        o.buf.push({ t, x, y, z, yaw, st }); if (o.buf.length > 30) o.buf.shift();
      }
      break;
    }
    case 'stats': {
      for (const [id, pct, lives] of m.s) {
        const o = others.get(id); if (!o) continue;
        o.pct = pct; o.lives = lives; o.f?.setLabel(pct);
        if (id === net.id) { if (pct > me.pct) { $('#mypct').classList.remove('bump'); void $('#mypct').offsetWidth; $('#mypct').classList.add('bump'); } me.pct = pct; me.lives = lives; }
      }
      renderCards(); break;
    }
    case 'atk': {
      if (m.id === net.id) break;
      const o = others.get(m.id); o?.f?.attack(m.k);
      const p = o?.buf[o.buf.length - 1];
      if (p && m.k === 'punch') { const n = nearMe(p.x, p.z); if (n > .5) sfx.swing(); }
      break;
    }
    case 'proj': {
      const mineKey = `m${m.s}`;
      if (m.owner === net.id && projs.has(mineKey)) { pidKey.set(m.pid, mineKey); break; }
      const k = `p${m.pid}`; pidKey.set(m.pid, k);
      addProj(k, m.x, m.y, m.z, m.dx, m.dy, m.dz, colorOf(others.get(m.owner)?.info.color ?? 0));
      sfx.cast();
      break;
    }
    case 'boom': {
      const k = pidKey.get(m.pid) ?? `p${m.pid}`, p = projs.get(k);
      const color = p?.color ?? new THREE.Color('#7fe8ff');
      p?.orb.dispose(); projs.delete(k); pidKey.delete(m.pid);
      fx.boom(m.x, m.y, m.z, color.clone().lerp(new THREE.Color('#ffffff'), .25));
      const n = nearMe(m.x, m.z); sfx.boom(n);
      if (n > .85) shake = Math.max(shake, .35);
      break;
    }
    case 'hit': {
      if (m.k === 'punch') { fx.punch(m.x, m.y, m.z, m.big); sfx.punch(m.big, nearMe(m.x, m.z)); }
      const o = others.get(m.id); if (o) { o.pct = m.pct; o.f?.setLabel(m.pct); }
      if (m.id === net.id) {
        const b = me.body;
        b.vx = m.ix; b.vz = m.iz; b.vy = Math.max(b.vy, m.iy); b.stun = m.stun; b.ground = false; b.dashT = 0;
        shake = Math.max(shake, m.big ? .9 : .4); hurt = m.big ? 1 : .6; sfx.hurt();
        navigator.vibrate?.(m.big ? 120 : 50);
        if (m.big) center('PAF !', '', 600);
      }
      break;
    }
    case 'ko': {
      fx.splash(m.x, m.z); sfx.splash(nearMe(m.x, m.z));
      const o = others.get(m.id); if (o) o.lives = m.lives;
      const who = `<b style="--c:${colorHex(m.id)}">${esc(m.id === net.id ? 'Toi' : nameOf(m.id))}</b>`;
      feed(m.by ? `<b style="--c:${colorHex(m.by)}">${esc(m.by === net.id ? 'Toi' : nameOf(m.by))}</b> 👊 ${who} à l'eau` : `${who} est tombé à l'eau`);
      if (m.id === net.id) {
        me.alive = false; me.deadT = performance.now(); me.deadX = m.x; me.deadZ = m.z; me.lives = m.lives;
        if (m.lives <= 0) { me.out = true; center('ÉLIMINÉ', 'Tu regardes la fin de la manche', 2500); }
        else center('PLOUF !', `Encore ${m.lives} vie${m.lives > 1 ? 's' : ''}… retour dans un instant`, 2200);
        sfx.ko();
      } else if (m.by === net.id) { center('À L\'EAU !', `${nameOf(m.id)} est éjecté`, 1200); }
      renderCards(); break;
    }
    case 'spawn': {
      fx.beam(m.x, terrainH(m.x, m.z), m.z);
      if (m.id === net.id) {
        me.body = newBody(m.x, m.y, m.z); me.yaw = m.yaw; me.pitch = -.3; me.alive = true; me.shield = performance.now() + 2000;
      } else { const o = others.get(m.id); if (o) o.buf = []; }
      break;
    }
    case 'end': {
      const won = m.winner === net.id;
      if (won) sfx.win();
      $('#e-title').textContent = m.winner ? (won ? 'Victoire !' : `${nameOf(m.winner)} gagne !`) : 'Match nul';
      $('#e-rank').innerHTML = m.ranking.map((id, i) => `<li style="--c:${colorHex(id)}"><i></i>${esc(id === net.id ? 'Toi' : nameOf(id))}<span>${['🥇', '🥈', '🥉'][i] ?? `${i + 1}e`}</span></li>`).join('');
      center(won ? 'VICTOIRE !' : 'FIN !', '', 1800);
      input.enabled = false; if (document.pointerLockElement) document.exitPointerLock();
      setTimeout(() => { if (screen === 'play') { screen = 'lobby'; $('#end').classList.remove('hidden'); renderLobby(); } }, 1800);
      break;
    }
    case 'error': toast(m.msg); training = 0; break;
  }
};
net.onStatus = s => { if (s === 'offline') toast('Connexion perdue… on réessaie.'); };
addEventListener('visibilitychange', () => { if (!document.hidden) net.wake(); });
net.connect();

// ---------- chaque image ----------
const clock = new THREE.Clock();
let t = 0, orbit = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20); t += dt;
  const now = performance.now();
  world.update(t, dt);
  if (screen === 'play' && others.size) play(dt, now);
  else {
    orbit += dt * .05;
    camera.fov = 55; camera.updateProjectionMatrix();
    camera.position.set(Math.cos(orbit) * 34, 13 + Math.sin(orbit * 2) * 2, Math.sin(orbit) * 34);
    camera.lookAt(0, 1.5, 0);
  }
  fx.update(dt);
  engine.render(dt);
}

function play(dt: number, now: number) {
  const sens = input.touch ? .0042 : .0022;
  me.yaw -= input.lookX * sens; me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - input.lookY * sens));
  input.lookX = input.lookY = 0;
  const started = now >= me.startAt;
  // compte à rebours
  const left = Math.ceil((me.startAt - now) / 1000);
  if (left !== me.count && left >= 0) {
    me.count = left;
    if (left > 0) { center(String(left), 'Éjecte les autres dans l\'eau !', 900); sfx.beep(); }
    else { center('BASTON !', '', 900); sfx.beep(true); }
  }
  $('#lockhint').classList.toggle('hidden', input.touch || !!document.pointerLockElement || !me.alive);

  const b = me.body;
  if (me.alive) {
    const mv = started ? input.move() : { x: 0, y: 0 };
    const f = { x: -Math.sin(me.yaw), z: -Math.cos(me.yaw) }, r = { x: Math.cos(me.yaw), z: -Math.sin(me.yaw) };
    const jump = input.take('jump') && started, dash = input.take('dash') && started;
    const wasGround = b.ground, dcd = b.dashCd;
    const fell = stepBody(b, { mx: f.x * mv.y + r.x * mv.x, mz: f.z * mv.y + r.z * mv.x, jump, dash }, dt);
    if (jump && (b.vy > 6 && (wasGround || b.airJumps === 0))) sfx.jump();
    if (dash && b.dashCd > dcd) { sfx.dash(); fov = 92; }
    if (fell) { net.send({ t: 'fell' }); me.alive = false; me.deadT = now; me.deadX = b.x; me.deadZ = b.z; }
    // les coups
    const ex = b.x, ey = b.y + MOVE.eye, ez = b.z;
    if (input.take('punch') && started && now >= me.cdPunch) {
      me.cdPunch = now + PUNCH.cd * 1000; vm?.punch(); sfx.swing();
      net.send({ t: 'atk', k: 'punch', x: b.x, y: b.y, z: b.z, yaw: me.yaw, pitch: me.pitch, s: ++me.seq });
    }
    if (input.take('blast') && started && now >= me.cdBlast) {
      me.cdBlast = now + BLAST.cd * 1000; vm?.blast(); sfx.cast();
      const d = fwd(me.yaw, me.pitch), s = ++me.seq;
      addProj(`m${s}`, ex + d.x * .7, ey - .15 + d.y * .7, ez + d.z * .7, d.x, d.y, d.z, colorOf(me.color));
      net.send({ t: 'atk', k: 'blast', x: b.x, y: b.y, z: b.z, yaw: me.yaw, pitch: me.pitch, s });
    }
    if (now - me.sendT > 33) {
      me.sendT = now;
      net.send({ t: 'in', x: +b.x.toFixed(3), y: +b.y.toFixed(3), z: +b.z.toFixed(3), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), st: (b.ground ? 1 : 0) | (b.dashT > 0 ? 2 : 0) | (b.stun > 0 ? 4 : 0) });
    }
    // caméra à la première personne
    const sp = Math.hypot(b.vx, b.vz);
    const bob = b.ground ? Math.sin(t * 11) * .035 * Math.min(1, sp / MOVE.speed) : 0;
    camera.position.set(b.x, b.y + MOVE.eye + bob, b.z);
    camera.rotation.set(me.pitch, me.yaw, 0, 'YXZ');
    const want = 78 + (b.stun > 0 ? 10 : 0) + Math.max(0, sp - MOVE.speed) * .6;
    fov += (Math.max(want, 78) - fov) * Math.min(1, dt * 6);
    if (vm) { vm.group.visible = true; vm.update(dt, sp, b.ground); }
    if (dash && b.dashT > 0) fx.dash(b.x, b.y, b.z, colorOf(me.color));
  } else {
    // à l'eau : on regarde la gerbe depuis le ciel, puis l'île
    if (vm) vm.group.visible = false;
    const k = Math.min(1, (now - me.deadT) / 1500);
    const cx = me.out ? Math.cos(t * .1) * 30 : me.deadX * (1 + k * .4), cz = me.out ? Math.sin(t * .1) * 30 : me.deadZ * (1 + k * .4);
    camera.position.lerp(new THREE.Vector3(cx, 6 + k * 10, cz), Math.min(1, dt * 3));
    camera.lookAt(me.out ? 0 : me.deadX * .5, 1, me.out ? 0 : me.deadZ * .5);
    fov += (70 - fov) * Math.min(1, dt * 3);
    void RESPAWN_MS;
  }
  // tremblement, flash rouge
  if (shake > 0) { camera.rotation.x += (Math.random() - .5) * shake * .05; camera.rotation.y += (Math.random() - .5) * shake * .05; shake = Math.max(0, shake - dt * 2.2); }
  hurt = Math.max(0, hurt - dt * 2.5); $('#hurt').style.opacity = String(hurt * .8);
  if (Math.abs(camera.fov - fov) > .05) { camera.fov = fov; camera.updateProjectionMatrix(); }

  // les autres (affichés avec 100 ms de retard pour lisser)
  const rt = now - 100;
  for (const o of others.values()) {
    if (!o.f) continue;
    const B = o.buf; if (!B.length) { o.f.update(dt, 0, true, false, false, false); continue; }
    let s = B[B.length - 1], x = s.x, y = s.y, z = s.z, yaw = s.yaw;
    for (let i = B.length - 2; i >= 0; i--) if (B[i].t <= rt) {
      const A = B[i], C = B[i + 1], u = Math.min(1, (rt - A.t) / Math.max(1, C.t - A.t));
      x = A.x + (C.x - A.x) * u; y = A.y + (C.y - A.y) * u; z = A.z + (C.z - A.z) * u;
      yaw = A.yaw + Math.atan2(Math.sin(C.yaw - A.yaw), Math.cos(C.yaw - A.yaw)) * u; s = A; break;
    }
    const sp = dt > 0 ? Math.hypot(x - o.last.x, z - o.last.z) / dt : 0; o.last.set(x, y, z);
    o.f.root.position.set(x, y, z); o.f.root.rotation.y = yaw + Math.PI;
    const st = s.st, alive = !(st & 16);
    o.f.update(dt, Math.min(sp, 12), !!(st & 1), !!(st & 4), !!(st & 8), alive);
    if (alive && st & 2) fx.dash(x, y, z, colorOf(o.info.color));
  }

  // projectiles (vol simulé dans la page en attendant l'explosion décidée par le serveur)
  for (const [k, p] of projs) {
    if (now > p.until) { p.orb.dispose(); projs.delete(k); continue; }
    const st = BLAST.speed * dt;
    p.x += p.dx * st; p.y += p.dy * st; p.z += p.dz * st;
    if (p.y < Math.max(0, terrainH(p.x, p.z))) { p.x -= p.dx * st; p.y -= p.dy * st; p.z -= p.dz * st; p.dx = p.dy = p.dz = 0; }
    p.orb.update(p.x, p.y, p.z, dt);
  }

  // boutons : temps de recharge
  const cdb = Math.max(0, me.cdBlast - now) / (BLAST.cd * 1000), cdd = b.dashCd / MOVE.dashCd;
  ($('#b-blast .cd') as HTMLElement).style.setProperty('--p', `${cdb * 100}%`); $('#b-blast').classList.toggle('wait', cdb > 0);
  ($('#b-dash .cd') as HTMLElement).style.setProperty('--p', `${cdd * 100}%`); $('#b-dash').classList.toggle('wait', cdd > 0);
  $('#cross').classList.toggle('ready', cdb <= 0);
}

// ---------- démarrage ----------
requestAnimationFrame(() => { $('#loading').style.opacity = '0'; setTimeout(() => $('#loading').remove(), 500); });
frame();
if (params.has('train')) $('#train').click();

// pour les tests automatiques
(window as any).__game = { me, others, net, camera, get screen() { return screen; }, input };
