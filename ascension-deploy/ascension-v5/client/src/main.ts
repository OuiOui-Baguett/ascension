// ============================================================
// Boot client — monde 3D, 4 machines par étage, chrono de 3 min.
// ============================================================
import { net } from './net';
import {
  initScene, setFloor, setPlayers, setRemotePos, setMoveInput, getMyPos,
  nearMachine, wheelSpinTo, slotsSpinTo, hiloShowCard, setCrashMult,
  crashCashFx, crashBustFx, coinBurst, floatText, bumpShake,
  rouletteSpinTo, crapsRollTo, bjShow, AVATAR_COLORS,
} from './scene';
import { floorAt, itemAt, fmt, CARD_NAMES } from '../../shared/content';

const ui = document.getElementById('ui')!;

let S: any = null;
let youId = '';
let timeOffset = 0;
let joined = false;
let connected = false;
let betFrac = 0.1;
let bankShown = 0;
let near: number | null = null;
let myCrash: { startAt: number; growth: number; tickMs: number; bet: number } | null = null;
let anyCrash: { startAt: number; growth: number; tickMs: number } | null = null;
let myHilo: { card: number; mult: number; steps: number; machineIdx: number } | null = null;
let myBJ: { total: number; dealerCard: number } | null = null;
let name = localStorage.getItem('ascension_name') || '';

const $ = (sel: string) => ui.querySelector(sel) as HTMLElement | null;
const now = () => Date.now() + timeOffset;
const vibrate = (ms: number) => navigator.vibrate?.(ms);

initScene(document.getElementById('scene') as HTMLCanvasElement);

// ---------- contrôles ----------
const stick = document.createElement('div');
stick.className = 'stick';
stick.innerHTML = '<div class="knob"></div>';
document.body.appendChild(stick);
const knob = stick.firstElementChild as HTMLElement;
let stickVec = { x: 0, z: 0 };
let stickId: number | null = null;

stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveKnob(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveKnob(e); });
const endStick = (e: PointerEvent) => {
  if (e.pointerId !== stickId) return;
  stickId = null;
  stickVec = { x: 0, z: 0 };
  knob.style.transform = 'translate(-50%,-50%)';
};
stick.addEventListener('pointerup', endStick);
stick.addEventListener('pointercancel', endStick);
function moveKnob(e: PointerEvent) {
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2);
  let dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2 - 18;
  const d = Math.hypot(dx, dy);
  if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  stickVec = { x: dx / max, z: dy / max };
}

const keys = new Set<string>();
addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); });
addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });

function inputVec(): { x: number; z: number } {
  let x = stickVec.x, z = stickVec.z;
  if (keys.has('arrowup') || keys.has('z') || keys.has('w')) z -= 1;
  if (keys.has('arrowdown') || keys.has('s')) z += 1;
  if (keys.has('arrowleft') || keys.has('q') || keys.has('a')) x -= 1;
  if (keys.has('arrowright') || keys.has('d')) x += 1;
  return { x, z };
}

const canWalk = () => joined && S && S.phase === 'FLOOR' && !myCrash && !myHilo && !myBJ;

setInterval(() => {
  const v = canWalk() ? inputVec() : { x: 0, z: 0 };
  setMoveInput(v.x, v.z);
  stick.style.display = canWalk() ? 'block' : 'none';
}, 16);

let lastSent = { x: Infinity, z: Infinity };
setInterval(() => {
  if (!joined) return;
  const p = getMyPos();
  if (!p) return;
  if (Math.abs(p.x - lastSent.x) > 0.03 || Math.abs(p.z - lastSent.z) > 0.03) {
    lastSent = p;
    net.send({ t: 'move', x: p.x, z: p.z });
  }
}, 100);

setInterval(() => {
  const n = nearMachine();
  if (n !== near) {
    near = n;
    if (S && S.phase === 'FLOOR') render();
  }
}, 200);

// ---------- réseau ----------
net.on('open', () => { connected = true; render(); });
net.on('closed', () => { connected = false; render(); });
net.on('joined', (msg) => { joined = true; youId = msg.youId; applyState(msg.state); });
net.on('state', (msg) => { if (msg.youId) youId = msg.youId; applyState(msg.state); });
net.on('error', (msg) => { if (!joined) toast(msg.text); });
net.on('pos', (msg) => {
  for (const [id, [x, z]] of Object.entries(msg.p) as any) {
    if (id !== youId) setRemotePos(id, x, z);
  }
});

function idxOf(machineId: string): number {
  return floorAt(S.floor).machines.findIndex((m: any) => m.id === machineId);
}

net.on('ev', (msg) => {
  if (msg.kind === 'reject') { toast(msg.text); return; }
  if (msg.text) toast(msg.text);
  const mi = msg.machineId ? Math.max(0, idxOf(msg.machineId)) : 0;
  switch (msg.kind) {
    case 'wheel_spin': wheelSpinTo(msg.mult, msg.spinMs); break;
    case 'wheel_win':
      coinBurst(mi);
      floatText(mi, `×${msg.mult}  +${fmt(msg.win)}`, '#7ee08a', msg.mult >= 5);
      bumpShake(0.4);
      break;
    case 'wheel_lose':
      floatText(mi, '×0', '#e05c5c');
      bumpShake(1); vibrate(80);
      break;
    case 'slots_spin': slotsSpinTo(msg.symbols, msg.spinMs); break;
    case 'slots_win':
      coinBurst(mi, msg.mult >= 25 ? 40 : 22);
      floatText(mi, `×${msg.mult}  +${fmt(msg.win)}`, '#7ee08a', msg.mult >= 10);
      bumpShake(msg.mult >= 25 ? 1.2 : 0.4);
      break;
    case 'slots_lose':
      floatText(mi, 'rien…', '#e05c5c');
      vibrate(60);
      break;
    case 'roulette_spin': rouletteSpinTo(msg.color, msg.spinMs); break;
    case 'roulette_win':
      coinBurst(mi, msg.mult >= 36 ? 40 : 22);
      floatText(mi, `+${fmt(msg.win)}`, '#7ee08a', msg.mult >= 36);
      bumpShake(0.5);
      break;
    case 'roulette_lose':
      floatText(mi, '✗', '#e05c5c');
      vibrate(60);
      break;
    case 'craps_roll': crapsRollTo(msg.d1, msg.d2, msg.rollMs); break;
    case 'craps_win':
      coinBurst(mi);
      floatText(mi, `+${fmt(msg.win)}`, '#7ee08a', msg.mult >= 5);
      bumpShake(0.5);
      break;
    case 'craps_lose':
      floatText(mi, '✗', '#e05c5c');
      vibrate(60);
      break;
    case 'crash_start':
      anyCrash = { startAt: msg.startAt, growth: msg.growth, tickMs: msg.tickMs };
      if (msg.playerId === youId) { myCrash = { ...anyCrash, bet: msg.bet }; render(); }
      break;
    case 'crash_cash':
      crashCashFx(mi);
      floatText(mi, `×${msg.mult}  +${fmt(msg.win)}`, '#7ee08a', msg.mult >= 3);
      anyCrash = null;
      if (msg.playerId === youId) { myCrash = null; render(); }
      break;
    case 'crash_bust':
      crashBustFx();
      floatText(mi, `💥 ×${msg.mult}`, '#e05c5c', true);
      vibrate(150);
      anyCrash = null;
      if (msg.playerId === youId) { myCrash = null; render(); }
      break;
    case 'hilo_start':
      hiloShowCard(msg.card);
      if (msg.playerId === youId) { myHilo = { card: msg.card, mult: 1, steps: 0, machineIdx: mi }; render(); }
      break;
    case 'hilo_card':
      hiloShowCard(msg.card);
      if (msg.playerId === youId) { myHilo = { card: msg.card, mult: msg.mult, steps: msg.steps, machineIdx: mi }; render(); }
      floatText(mi, `✓ ×${msg.mult}`, '#7ee08a');
      break;
    case 'hilo_bust':
      hiloShowCard(msg.card);
      floatText(mi, '✗', '#e05c5c', true);
      bumpShake(1); vibrate(120);
      if (msg.playerId === youId) { myHilo = null; render(); }
      break;
    case 'hilo_cash':
      coinBurst(mi);
      floatText(mi, `+${fmt(msg.win)}`, '#7ee08a', msg.mult >= 3);
      if (msg.playerId === youId) { myHilo = null; render(); }
      break;
    case 'bj_start':
      bjShow(String(msg.total), String(msg.dealerCard));
      if (msg.playerId === youId) { myBJ = { total: msg.total, dealerCard: msg.dealerCard }; render(); }
      break;
    case 'bj_card':
      bjShow(String(msg.total), myBJ && msg.playerId === youId ? String(myBJ.dealerCard) : '?');
      if (msg.playerId === youId) { myBJ = { total: msg.total, dealerCard: myBJ?.dealerCard ?? 0 }; render(); }
      break;
    case 'bj_bust':
      bjShow(String(msg.total), '—');
      floatText(mi, `💥 ${msg.total}`, '#e05c5c', true);
      bumpShake(1); vibrate(120);
      if (msg.playerId === youId) { myBJ = null; render(); }
      break;
    case 'bj_result':
      bjShow(String(msg.total), String(msg.dealerTotal));
      if (msg.outcome === 'BLACKJACK' || msg.outcome === 'WIN') {
        coinBurst(mi, msg.outcome === 'BLACKJACK' ? 40 : 22);
        floatText(mi, `+${fmt(msg.win)}`, '#7ee08a', msg.outcome === 'BLACKJACK');
      } else if (msg.outcome === 'LOSE') {
        floatText(mi, `${msg.dealerTotal} ✗`, '#e05c5c');
        vibrate(80);
      }
      if (msg.playerId === youId) { myBJ = null; render(); }
      break;
    case 'toll':
      coinBurst(0, 12); coinBurst(3, 12);
      break;
    case 'fall':
      bumpShake(2.2); vibrate(300);
      break;
  }
});

function applyState(state: any) {
  const prevPhase = S?.phase;
  S = state;
  timeOffset = state.serverNow - Date.now();
  setFloor(state.floor);
  setPlayers(state.players, youId);
  if (prevPhase !== state.phase) {
    if (state.phase !== 'FLOOR') { myCrash = null; myHilo = null; myBJ = null; anyCrash = null; setCrashMult(null); }
    render();
  } else softUpdate();
}

// ---------- helpers ----------
let toastTimer: any = null;
function toast(text: string) {
  let el = document.querySelector('.toast') as HTMLElement | null;
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.remove('fade');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el!.classList.add('fade'), 2600);
}
function remain(): number {
  return S ? Math.max(0, Math.ceil((S.phaseEndsAt - now()) / 1000)) : 0;
}
function fmtNet(n: number): string {
  const a = Math.abs(n);
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(a >= 10_000 ? 0 : 1)}k`;
  return `${sign}${Math.round(a)}`;
}

// liste latérale : qui fait gagner (ou couler) l'équipe
function sideList(): string {
  if (!S?.players?.length) return '';
  const rows = [...S.players]
    .sort((a: any, b: any) => (b.net ?? 0) - (a.net ?? 0))
    .map((p: any) => {
      const i = S.players.findIndex((x: any) => x.id === p.id);
      const net = p.net ?? 0;
      const cls = net > 0 ? 'up' : net < 0 ? 'down' : 'flat';
      return `<div class="srow ${p.id === youId ? 'me' : ''}">
        <i style="background:${AVATAR_COLORS[i % 4]}"></i>
        <span class="sname">${p.name}</span>
        <b class="mono ${cls}">${fmtNet(net)}</b>
      </div>`;
    }).join('');
  return `<div class="side">${rows}</div>`;
}

const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function me() { return S?.players.find((p: any) => p.id === youId); }
function busy() { return !!me()?.playing || !!myCrash || !!myHilo || !!myBJ; }
function betAmount(): number {
  if (!S) return 0;
  const raw = Math.round(S.bank * betFrac);
  return Math.max(S.betMin, Math.min(S.betMax, Math.min(raw, S.bank)));
}

// ---------- rendu ----------
function render() {
  if (!S || !joined) { renderHome(); return; }
  switch (S.phase) {
    case 'LOBBY': renderLobby(); break;
    case 'BRIEFING': renderBriefing(); break;
    case 'FLOOR': renderGame(); break;
    case 'SHOP': renderShop(); break;
    case 'FALLING': renderFalling(); break;
    case 'VICTORY': renderVictory(); break;
  }
  if (!connected) ui.insertAdjacentHTML('beforeend', `<div class="reconnect">⚡ Reconnexion…</div>`);
}

function renderHome() {
  ui.innerHTML = `
    <div class="screen">
      <h1>ASCENSION</h1>
      <p>5 étages. Une banque commune. Tout le monde peut tout perdre.</p>
      <input class="field" id="name" maxlength="14" placeholder="TON NOM" value="${name}">
      <button class="btn" id="create">CRÉER UNE TABLE</button>
      <input class="field" id="code" maxlength="4" placeholder="CODE">
      <button class="btn ghost" id="join">REJOINDRE</button>
    </div>`;
  const nameEl = $('#name') as HTMLInputElement;
  nameEl.oninput = () => { name = nameEl.value; localStorage.setItem('ascension_name', name); };
  $('#create')!.onclick = () => { net.forget(); net.send({ t: 'create', name }); };
  $('#join')!.onclick = () => {
    const code = ($('#code') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length !== 4) return toast('Code à 4 lettres.');
    net.forget(); net.send({ t: 'join', code, name });
  };
}

function renderLobby() {
  ui.innerHTML = `
    <div class="screen">
      <p>Code de la table</p>
      <div class="code">${S.code}</div>
      <p>2 à 4 joueurs, chacun sur son téléphone — même Wi-Fi.</p>
      <div class="players">
        ${S.players.map((p: any) => `<div>${p.id === youId ? '👉 ' : ''}${p.name}${p.connected ? '' : ' ⚡'}</div>`).join('')}
      </div>
      <button class="btn" id="start">LANCER LA PARTIE</button>
    </div>`;
  $('#start')!.onclick = () => net.send({ t: 'start' });
}

function renderBriefing() {
  const f = floorAt(S.floor);
  ui.innerHTML = `
    <div class="screen soft">
      <div class="big">${f.theme.emoji}</div>
      <h2>Étage ${f.index} — ${f.name}</h2>
      <p>${f.sub}</p>
      <p class="mono"><b>3 minutes</b> pour couvrir le Péage : <b>${fmt(S.toll)}</b><br>
      Mises : ${fmt(S.betMin)} → ${fmt(S.betMax)} · 4 machines</p>
    </div>`;
  bankShown = S.bank;
}

function renderGame() {
  const amount = betAmount();
  const fracs = [0.05, 0.1, 0.25, 0.5];
  const f = floorAt(S.floor);

  let bottom = '';
  if (myCrash) {
    bottom = `
      <div class="actionbar crashbar">
        <div class="mult mono" id="mult">×1.00</div>
        <button class="bigcash" id="cashout">💰 ENCAISSER</button>
      </div>`;
  } else if (myHilo) {
    const c = myHilo.card;
    const pHi = (13 - c) / 13, pLo = (c - 1) / 13;
    const mHi = pHi > 0 ? (0.97 / pHi) : 0, mLo = pLo > 0 ? (0.97 / pLo) : 0;
    bottom = `
      <div class="actionbar">
        <div class="hilohead mono">Carte : <b>${CARD_NAMES[c]}</b> · multi ×${myHilo.mult.toFixed(2)}</div>
        <div class="hilobtns">
          <button class="hb" id="lo" ${pLo <= 0 ? 'disabled' : ''}>⬇️ PLUS BAS<br><span class="mono">×${mLo.toFixed(2)}</span></button>
          <button class="hb" id="hi" ${pHi <= 0 ? 'disabled' : ''}>⬆️ PLUS HAUT<br><span class="mono">×${mHi.toFixed(2)}</span></button>
        </div>
        <button class="go" id="hcash" ${myHilo.steps === 0 ? 'disabled' : ''}>💰 ENCAISSER ×${myHilo.mult.toFixed(2)}</button>
      </div>`;
  } else if (myBJ) {
    bottom = `
      <div class="actionbar">
        <div class="hilohead mono">Toi : <b>${myBJ.total}</b> · Croupier : <b>${myBJ.dealerCard}</b></div>
        <div class="hilobtns">
          <button class="hb" id="bjhit">🃏 TIRER</button>
          <button class="hb" id="bjstand">✋ RESTER</button>
        </div>
      </div>`;
  } else if (near !== null && !busy()) {
    const m = f.machines[near];
    const icon = { WHEEL: '🎡', CRASH: '⚡', SLOTS: '🎰', HILO: '🃏', ROULETTE: '🎯', BLACKJACK: '♠️', CRAPS: '🎲' }[m.archetype];
    const chipsHtml = `
      <div class="chips">
        ${fracs.map(fr => `<button data-f="${fr}" class="${fr === betFrac ? 'sel' : ''}">${Math.round(fr * 100)}%<br><span class="mono">${fmt(Math.max(S.betMin, Math.min(S.betMax, Math.round(S.bank * fr))))}</span></button>`).join('')}
      </div>`;
    let action = '';
    if (m.archetype === 'ROULETTE') {
      action = `
        <div class="hilobtns">
          <button class="hb opt red" data-o="RED">🔴 ROUGE<br><span class="mono">×2</span></button>
          <button class="hb opt" data-o="BLACK">⚫ NOIR<br><span class="mono">×2</span></button>
          <button class="hb opt green" data-o="GREEN">🟢 VERT<br><span class="mono">×36</span></button>
        </div>`;
    } else if (m.archetype === 'CRAPS') {
      action = `
        <div class="hilobtns">
          <button class="hb opt" data-o="UNDER">⬇️ SOUS 7<br><span class="mono">×2.3</span></button>
          <button class="hb opt" data-o="SEVEN">🎯 PILE 7<br><span class="mono">×5.8</span></button>
          <button class="hb opt" data-o="OVER">⬆️ SUR 7<br><span class="mono">×2.3</span></button>
        </div>`;
    } else {
      const verb = m.archetype === 'CRASH' ? 'ENGAGER' : m.archetype === 'BLACKJACK' || m.archetype === 'HILO' ? 'JOUER' : 'MISER';
      action = `<button class="go" id="go">${icon} ${verb} ${fmt(amount)}</button>`;
    }
    bottom = `
      <div class="actionbar">
        <div class="abhead"><b>${icon} ${m.name}</b><small class="mdesc">${m.desc}</small></div>
        ${chipsHtml}
        ${action}
      </div>`;
  } else if (busy()) {
    bottom = `<div class="hint">⏳ Mise en cours…</div>`;
  } else {
    bottom = `<div class="hint">🕹️ Approche-toi d'une machine pour miser</div>`;
  }

  ui.innerHTML = `${topBar()}${sideList()}${bottom}`;

  ui.querySelectorAll('.chips button').forEach(b => {
    (b as HTMLElement).onclick = () => { betFrac = Number((b as HTMLElement).dataset.f); render(); };
  });
  const go = $('#go');
  if (go) go.onclick = () => {
    if (near !== null) net.send({ t: 'bet', machineId: f.machines[near].id, amount: betAmount() });
  };
  const cash = $('#cashout');
  if (cash) cash.onclick = () => net.send({ t: 'cashout' });
  const hi = $('#hi'); if (hi) hi.onclick = () => net.send({ t: 'hilo', choice: 'HI' });
  const lo = $('#lo'); if (lo) lo.onclick = () => net.send({ t: 'hilo', choice: 'LO' });
  const hc = $('#hcash'); if (hc) hc.onclick = () => net.send({ t: 'cashout' });
  const bjh = $('#bjhit'); if (bjh) bjh.onclick = () => net.send({ t: 'bj', action: 'HIT' });
  const bjs = $('#bjstand'); if (bjs) bjs.onclick = () => net.send({ t: 'bj', action: 'STAND' });
  ui.querySelectorAll('.opt').forEach(b => {
    (b as HTMLElement).onclick = () => {
      if (near !== null) net.send({ t: 'bet', machineId: f.machines[near].id, amount: betAmount(), opt: (b as HTMLElement).dataset.o });
    };
  });
  const elev = $('#elev'); if (elev) elev.onclick = () => net.send({ t: 'elevator' });
  bindQuit();
}

function renderShop() {
  const next = floorAt(S.floor + 1);
  ui.innerHTML = `
    ${topBar()}${sideList()}
    <div class="screen soft shopscreen">
      <h2>🛗 L'ascenseur — Shop</h2>
      <p>Prochain étage : ${next.theme.emoji} ${next.name} — départ dans <b class="mono" id="shopT">${remain()}</b> s</p>
      <div class="items">
        ${S.offers.map((o: any) => {
          const it = itemAt(o.itemId)!;
          return `<div class="item">
            <div class="ic">${it.icon}</div>
            <div><b>${it.name}</b><small>${it.desc}</small></div>
            <button data-i="${o.itemId}" ${o.price > S.bank ? 'disabled' : ''}>${fmt(o.price)}</button>
          </div>`;
        }).join('') || '<p>Plus rien en rayon.</p>'}
      </div>
    </div>`;
  ui.querySelectorAll('.item button').forEach(b => {
    (b as HTMLElement).onclick = () => net.send({ t: 'buy', itemId: (b as HTMLElement).dataset.i });
  });
  bindQuit();
}

function renderFalling() {
  ui.innerHTML = `
    <div class="screen fall-screen">
      <div class="big">🕳️</div>
      <h1>LA CHUTE</h1>
      <p>La tour vous regarde.<br>Retour à l'étage 1.</p>
    </div>`;
}

function renderVictory() {
  const st = S.stats;
  ui.innerHTML = `
    <div class="screen victory-screen">
      <div class="big">👑</div>
      <h1>LA DERNIÈRE PORTE</h1>
      <p>Vous êtes arrivés au bout de la tour.</p>
      <div class="stats mono">
        <div>Banque finale : <b>${fmt(S.bank)}</b></div>
        <div>Plus gros gain : ${fmt(st.biggestWin)}</div>
        <div>Plus grosse perte : ${fmt(st.biggestLoss)}</div>
        <div>Chutes : ${st.falls}</div>
      </div>
      <button class="btn" id="again">REJOUER — MÊME ÉQUIPE</button>
      <button class="btn ghost" id="leave">QUITTER LA TABLE</button>
    </div>`;
  $('#again')!.onclick = () => net.send({ t: 'start' });
  $('#leave')!.onclick = () => { net.forget(); location.reload(); };
}

function topBar(): string {
  const pct = Math.min(100, (S.bank / S.toll) * 100);
  const canElev = S.phase === 'FLOOR' && S.bank >= S.toll;
  return `
    <div class="top">
      <div class="row">
        <span class="floor">${floorAt(S.floor).theme.emoji} Étage ${S.floor}</span>
        <span><span class="timer mono" id="timer">${fmtT(remain())}</span><button class="quit" id="quit">✕</button></span>
      </div>
      <div class="row"><span class="bank mono" id="bank">${fmt(bankShown)}</span></div>
      <div class="tollbar"><i style="width:${pct}%"></i></div>
      <div class="tolltxt mono"><span>Péage</span><span id="tollv">${fmt(S.bank)} / ${fmt(S.toll)}</span></div>
      ${canElev ? `<button class="elevbtn" id="elev">🛗 APPELER L'ASCENSEUR</button>` : ''}
    </div>`;
}

function bindQuit() {
  const q = $('#quit');
  if (q) q.onclick = () => {
    if (confirm('Quitter la table ? (la partie continue sans toi)')) { net.forget(); location.reload(); }
  };
}

function softUpdate() {
  const t = $('#timer'); if (t) t.textContent = fmtT(remain());
  const st = $('#shopT'); if (st) st.textContent = String(remain());
  const bar = ui.querySelector('.tollbar i') as HTMLElement | null;
  if (bar) bar.style.width = `${Math.min(100, (S.bank / S.toll) * 100)}%`;
  const tv = $('#tollv'); if (tv) tv.textContent = `${fmt(S.bank)} / ${fmt(S.toll)}`;
  const side = $('.side');
  if (side) side.outerHTML = sideList();
  if (S.phase === 'FLOOR') {
    // bouton ascenseur qui apparaît/disparaît
    const canElev = S.bank >= S.toll;
    if (canElev !== !!$('#elev')) render();
    // transitions occupé ↔ libre
    if (!busy() && $('.hint')?.textContent?.includes('en cours')) render();
    if (busy() && !myCrash && !myHilo && !myBJ && $('.actionbar')) render();
  }
}

setInterval(() => {
  if (!S) return;
  if (Math.abs(bankShown - S.bank) > 0.5) {
    bankShown += (S.bank - bankShown) * 0.18;
    if (Math.abs(bankShown - S.bank) < 1) bankShown = S.bank;
    const b = $('#bank'); if (b) b.textContent = fmt(bankShown);
  }
  if (myCrash) {
    const ticks = (now() - myCrash.startAt) / myCrash.tickMs;
    const mult = Math.pow(myCrash.growth, Math.max(0, ticks));
    const el = $('#mult'); if (el) el.textContent = '×' + mult.toFixed(2);
  }
  if (anyCrash) {
    const ticks = (now() - anyCrash.startAt) / anyCrash.tickMs;
    setCrashMult(Math.pow(anyCrash.growth, Math.max(0, ticks)));
  }
}, 90);

// aperçu décor : ouvrir /?floor=3 montre l'étage 3 sans jouer (debug/DA)
const previewFloor = Number(new URLSearchParams(location.search).get('floor'));
if (previewFloor >= 1 && previewFloor <= 5) setFloor(previewFloor);

net.connect();
render();
