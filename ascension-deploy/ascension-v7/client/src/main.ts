// ============================================================
// Client — monde 3D, cagnotte commune, boutique, mise à la main.
// ============================================================
import { net } from './net';
import {
  initScene, setFloor, setPlayers, setRemotePos, setMoveInput, getMyPos, nearestSpot,
  wheelSpinTo, slotsSpinTo, hiloShowCard, rouletteSpinTo, crapsRollTo, bjShow,
  chestsOpen, plinkoDropTo, setCrashMult, crashCashFx, crashBustFx,
  coinBurst, floatText, bumpShake, type Spot,
} from './scene';
import { floorAt, ITEMS, itemAt, fmt, CARD_NAMES, SKIN_COLORS, HATS } from '../../shared/content';

const ui = document.getElementById('ui')!;
let S: any = null, youId = '', timeOffset = 0;
let joined = false, connected = false;
let bankShown = 0, betVal = 0;
let spot: Spot | null = null, spotKey = '';
let myCrash: any = null, anyCrash: any = null, myHilo: any = null, myBJ: any = null;
let panel: 'NONE' | 'SHOP' = 'NONE';
let name = localStorage.getItem('ascension_name') || '';
let skinColor = Number(localStorage.getItem('ascension_color') || 0);
let skinHat = Number(localStorage.getItem('ascension_hat') || 0);

const $ = (s: string) => ui.querySelector(s) as HTMLElement | null;
const now = () => Date.now() + timeOffset;
const vibrate = (ms: number) => navigator.vibrate?.(ms);
const esc = (s: string) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

initScene(document.getElementById('scene') as HTMLCanvasElement);

// ---------- joystick + clavier ----------
const stick = document.createElement('div');
stick.className = 'stick'; stick.innerHTML = '<div class="knob"></div>';
document.body.appendChild(stick);
const knob = stick.firstElementChild as HTMLElement;
let sv = { x: 0, z: 0 }, sid: number | null = null;
stick.addEventListener('pointerdown', e => { sid = e.pointerId; stick.setPointerCapture(e.pointerId); mk(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === sid) mk(e); });
const endS = (e: PointerEvent) => { if (e.pointerId !== sid) return; sid = null; sv = { x: 0, z: 0 }; knob.style.transform = 'translate(-50%,-50%)'; };
stick.addEventListener('pointerup', endS); stick.addEventListener('pointercancel', endS);
function mk(e: PointerEvent) {
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2 - 18, d = Math.hypot(dx, dy);
  if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  sv = { x: dx / max, z: dy / max };
}
const keys = new Set<string>();
addEventListener('keydown', e => { if (!(e.target as HTMLElement)?.matches?.('input')) keys.add(e.key.toLowerCase()); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function inputVec() {
  let x = sv.x, z = sv.z;
  if (keys.has('arrowup') || keys.has('z') || keys.has('w')) z -= 1;
  if (keys.has('arrowdown') || keys.has('s')) z += 1;
  if (keys.has('arrowleft') || keys.has('q') || keys.has('a')) x -= 1;
  if (keys.has('arrowright') || keys.has('d')) x += 1;
  return { x, z };
}
const canWalk = () => joined && S && S.phase === 'FLOOR' && !myCrash && !myHilo && !myBJ && panel === 'NONE';

setInterval(() => {
  const v = canWalk() ? inputVec() : { x: 0, z: 0 };
  setMoveInput(v.x, v.z);
  stick.style.display = canWalk() ? 'block' : 'none';
}, 16);

let lastSent = { x: Infinity, z: Infinity };
setInterval(() => {
  if (!joined) return;
  const p = getMyPos(); if (!p) return;
  if (Math.abs(p.x - lastSent.x) > .03 || Math.abs(p.z - lastSent.z) > .03) {
    lastSent = p; net.send({ t: 'move', x: p.x, z: p.z });
  }
}, 100);

// proximité : ouvre/ferme la barre d'action
setInterval(() => {
  const s = nearestSpot();
  const key = s ? (s.kind === 'MACHINE' ? 'M' + s.index : s.kind) : '';
  if (key !== spotKey) {
    spotKey = key; spot = s;
    if (panel !== 'NONE') panel = 'NONE';
    if (S && S.phase === 'FLOOR') render();
  }
}, 200);

// ---------- réseau ----------
net.on('open', () => { connected = true; render(); });
net.on('closed', () => { connected = false; render(); });
net.on('joined', m => { joined = true; youId = m.youId; applyState(m.state); });
net.on('state', m => { if (m.youId) youId = m.youId; applyState(m.state); });
net.on('error', m => { if (!joined) toast(m.text); });
net.on('pos', m => { for (const [id, [x, z]] of Object.entries(m.p) as any) if (id !== youId) setRemotePos(id, x, z); });

const idxOf = (id: string) => Math.max(0, floorAt(S.floor).machines.findIndex((m: any) => m.id === id));

net.on('ev', m => {
  if (m.kind === 'reject') { toast(m.text); vibrate(40); return; }
  if (m.text) toast(m.text);
  const i = m.machineId ? idxOf(m.machineId) : 0;
  const mine = m.playerId === youId;
  switch (m.kind) {
    case 'wheel_spin': wheelSpinTo(m.mult, m.spinMs); break;
    case 'slots_spin': slotsSpinTo(m.symbols, m.spinMs); break;
    case 'roulette_spin': rouletteSpinTo(m.color, m.spinMs); break;
    case 'craps_roll': crapsRollTo(m.d1, m.d2, m.rollMs); break;
    case 'chests_open': chestsOpen(m.pick, m.reveal, m.openMs); break;
    case 'plinko_drop': plinkoDropTo(m.path, m.slot, m.dropMs); break;
    case 'crash_start':
      anyCrash = { startAt: m.startAt, growth: m.growth, tickMs: m.tickMs };
      if (mine) { myCrash = { ...anyCrash, bet: m.bet, idx: i }; render(); }
      break;
    case 'hilo_start':
      hiloShowCard(m.card);
      if (mine) { myHilo = { card: m.card, mult: 1, steps: 0 }; render(); }
      break;
    case 'hilo_card':
      hiloShowCard(m.card);
      floatText(i, `✓ ×${m.mult}`, '#7ee08a');
      if (mine) { myHilo = { card: m.card, mult: m.mult, steps: m.steps }; render(); }
      break;
    case 'hilo_bust': hiloShowCard(m.card); if (mine) { myHilo = null; render(); } break;
    case 'bj_start': bjShow(String(m.total), String(m.dealerCard)); if (mine) { myBJ = { total: m.total, dealerCard: m.dealerCard }; render(); } break;
    case 'bj_card': bjShow(String(m.total), mine && myBJ ? String(myBJ.dealerCard) : '?'); if (mine) { myBJ = { total: m.total, dealerCard: myBJ?.dealerCard ?? 0 }; render(); } break;
    case 'bj_bust': bjShow(String(m.total), '—'); if (mine) { myBJ = null; render(); } break;
    case 'bj_result': bjShow(String(m.total), String(m.dealerTotal)); if (mine) { myBJ = null; render(); } break;
    case 'fall': bumpShake(2.2); vibrate(300); break;
  }
  // résultats génériques (gagné / perdu) — un seul chemin
  if (m.kind.endsWith('_win')) {
    coinBurst(i, m.win > 0 ? 24 : 12);
    floatText(i, `+${fmt(m.win)}`, '#7ee08a', (m.mult ?? 0) >= 5);
    bumpShake(.5);
    if (mine) { myCrash = null; myHilo = null; myBJ = null; render(); }
  } else if (m.kind.endsWith('_lose')) {
    floatText(i, '✗', '#e05c5c', (m.kind || '').includes('crash'));
    if ((m.kind || '').includes('crash')) crashBustFx(); else vibrate(70);
    if (mine) { myCrash = null; myHilo = null; myBJ = null; render(); }
  }
  if (m.kind === 'crash_cash__win') crashCashFx(i);
});

function applyState(state: any) {
  const prev = S?.phase, prevFloor = S?.floor;
  S = state;
  timeOffset = state.serverNow - Date.now();
  setFloor(state.floor);
  setPlayers(state.players, youId);
  if (prev !== state.phase || prevFloor !== state.floor) {
    if (state.phase !== 'FLOOR') { myCrash = myHilo = myBJ = anyCrash = null; setCrashMult(null); panel = 'NONE'; }
    betVal = 0;
    render();
  } else softUpdate();
}

// ---------- helpers ----------
let tTimer: any = null;
function toast(text: string) {
  let el = document.querySelector('.toast') as HTMLElement | null;
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text; el.classList.remove('fade');
  clearTimeout(tTimer); tTimer = setTimeout(() => el!.classList.add('fade'), 2600);
}
const remain = () => S ? Math.max(0, Math.ceil((S.phaseEndsAt - now()) / 1000)) : 0;
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const me = () => S?.players.find((p: any) => p.id === youId);
const purse = () => S?.bank ?? 0;
const busy = () => !!me()?.playing || !!myCrash || !!myHilo || !!myBJ;

function fmtNet(n: number) {
  const a = Math.abs(n), s = n > 0 ? '+' : n < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${s}${Math.round(a)}`;
}
function clampBet(v: number) {
  return Math.max(S.betMin, Math.min(S.betMax, Math.min(Math.round(v || 0), purse())));
}
function ensureBet() {
  if (!betVal) betVal = clampBet(S.betMin);
  betVal = clampBet(betVal);
}

// ---------- rendu ----------
function render() {
  if (!S || !joined) return renderHome();
  switch (S.phase) {
    case 'LOBBY': renderLobby(); break;
    case 'BRIEFING': renderBriefing(); break;
    case 'FLOOR': renderGame(); break;
    case 'ELEVATOR': renderElevator(); break;
    case 'FALLING': renderFalling(); break;
    case 'VICTORY': renderVictory(); break;
  }
  if (!connected) ui.insertAdjacentHTML('beforeend', `<div class="reconnect">⚡ Reconnexion…</div>`);
}

function renderHome() {
  ui.innerHTML = `
    <div class="screen">
      <h1>ASCENSION</h1>
      <p>5 étages. Une cagnotte commune. Tout le monde peut tout perdre.</p>
      <input class="field" id="name" maxlength="14" placeholder="TON NOM" value="${esc(name)}">
      <div class="skin">
        <div class="skinrow" id="cols">
          ${SKIN_COLORS.map((c, i) => `<button class="sw ${i === skinColor ? 'sel' : ''}" data-c="${i}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="skinrow" id="hats">
          ${HATS.map(h => `<button class="ht ${h.id === skinHat ? 'sel' : ''}" data-h="${h.id}">${['🚫', '🧢', '👑', '🎩', '📡', '😇'][h.id]}</button>`).join('')}
        </div>
      </div>
      <button class="btn" id="create">CRÉER UNE TABLE</button>
      <input class="field" id="code" maxlength="4" placeholder="CODE">
      <button class="btn ghost" id="join">REJOINDRE</button>
    </div>`;
  const ne = $('#name') as HTMLInputElement;
  ne.oninput = () => { name = ne.value; localStorage.setItem('ascension_name', name); };
  ui.querySelectorAll('.sw').forEach(b => (b as HTMLElement).onclick = () => {
    skinColor = Number((b as HTMLElement).dataset.c); localStorage.setItem('ascension_color', String(skinColor)); render();
  });
  ui.querySelectorAll('.ht').forEach(b => (b as HTMLElement).onclick = () => {
    skinHat = Number((b as HTMLElement).dataset.h); localStorage.setItem('ascension_hat', String(skinHat)); render();
  });
  $('#create')!.onclick = () => { net.forget(); net.send({ t: 'create', name, color: skinColor, hat: skinHat }); };
  $('#join')!.onclick = () => {
    const code = ($('#code') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length !== 4) return toast('Code à 4 lettres.');
    net.forget(); net.send({ t: 'join', code, name, color: skinColor, hat: skinHat });
  };
}

function renderLobby() {
  ui.innerHTML = `
    <div class="screen">
      <p>Code de la table</p>
      <div class="code">${S.code}</div>
      <p>2 à 4 joueurs. Chacun sur son téléphone.</p>
      <div class="players">
        ${S.players.map((p: any) => `<div><span class="dot" style="background:${SKIN_COLORS[p.color % 6]}"></span>${esc(p.name)}${p.connected ? '' : ' ⚡'}</div>`).join('')}
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
      <p class="mono"><b>3 minutes</b> · Péage : <b>${fmt(S.toll)}</b></p>
      <p class="tip">💰 Les mises sortent de la <b>cagnotte commune</b> et les gains y retournent. Atteignez le Péage avant la fin du chrono.</p>
    </div>`;
  bankShown = S.bank;
}

function renderElevator() {
  const nx = floorAt(S.floor + 1);
  ui.innerHTML = `<div class="screen"><div class="big">🛗</div><h2>L'ascenseur monte…</h2>
    <p>Prochain étage : ${nx ? nx.theme.emoji + ' ' + nx.name : ''}</p></div>`;
}
function renderFalling() {
  ui.innerHTML = `<div class="screen fall-screen"><div class="big">🕳️</div><h1>LA CHUTE</h1>
    <p>La tour vous regarde.<br>Retour à l'étage 1.</p></div>`;
}
function renderVictory() {
  const st = S.stats;
  ui.innerHTML = `
    <div class="screen victory-screen">
      <div class="big">👑</div><h1>LA DERNIÈRE PORTE</h1>
      <p>Vous êtes arrivés au bout de la tour.</p>
      <div class="stats mono">
        <div>Cagnotte finale : <b>${fmt(S.bank)}</b></div>
        <div>Plus gros gain : ${fmt(st.biggestWin)}</div>
        <div>Chutes : ${st.falls}</div>
      </div>
      <button class="btn" id="again">REJOUER</button>
      <button class="btn ghost" id="leave">QUITTER</button>
    </div>`;
  $('#again')!.onclick = () => net.send({ t: 'start' });
  $('#leave')!.onclick = () => { net.forget(); location.reload(); };
}

// --- saisie manuelle de la mise ---
function betPad(): string {
  ensureBet();
  const step = S.betMin;
  return `
    <div class="betpad">
      <button class="stepb" id="bminus">−</button>
      <input class="betin mono" id="betin" type="number" inputmode="numeric" value="${betVal}">
      <button class="stepb" id="bplus">+</button>
    </div>
    <div class="quick">
      <button data-q="min">Min</button>
      <button data-q="x2">×2</button>
      <button data-q="half">÷2</button>
      <button data-q="all">Tout</button>
    </div>`;
}
function bindBetPad(after: () => void) {
  const inp = $('#betin') as HTMLInputElement | null;
  if (!inp) return;
  inp.oninput = () => { betVal = Math.round(Number(inp.value) || 0); };
  inp.onblur = () => { betVal = clampBet(betVal); after(); };
  $('#bminus')!.onclick = () => { betVal = clampBet(betVal - S.betMin); after(); };
  $('#bplus')!.onclick = () => { betVal = clampBet(betVal + S.betMin); after(); };
  ui.querySelectorAll('.quick button').forEach(b => (b as HTMLElement).onclick = () => {
    const q = (b as HTMLElement).dataset.q;
    betVal = clampBet(q === 'min' ? S.betMin : q === 'x2' ? betVal * 2 : q === 'half' ? betVal / 2 : purse());
    after();
  });
}

function renderGame() {
  const f = floorAt(S.floor);
  let bottom = '';

  if (myCrash) {
    bottom = `<div class="actionbar crashbar">
      <div class="mult mono" id="mult">×1.00</div>
      <button class="bigcash" id="cashout">💰 ENCAISSER</button></div>`;
  } else if (myHilo) {
    const c = myHilo.card, pHi = (13 - c) / 13, pLo = (c - 1) / 13;
    bottom = `<div class="actionbar">
      <div class="hilohead mono">Carte <b>${CARD_NAMES[c]}</b> · ×${myHilo.mult.toFixed(2)}</div>
      <div class="hilobtns">
        <button class="hb" id="lo" ${pLo <= 0 ? 'disabled' : ''}>⬇️ PLUS BAS<br><span class="mono">×${pLo > 0 ? (0.97 / pLo).toFixed(2) : '—'}</span></button>
        <button class="hb" id="hi" ${pHi <= 0 ? 'disabled' : ''}>⬆️ PLUS HAUT<br><span class="mono">×${pHi > 0 ? (0.97 / pHi).toFixed(2) : '—'}</span></button>
      </div>
      <button class="go" id="hcash" ${myHilo.steps === 0 ? 'disabled' : ''}>💰 ENCAISSER ×${myHilo.mult.toFixed(2)}</button></div>`;
  } else if (myBJ) {
    bottom = `<div class="actionbar">
      <div class="hilohead mono">Toi <b>${myBJ.total}</b> · Croupier <b>${myBJ.dealerCard}</b></div>
      <div class="hilobtns">
        <button class="hb" id="bjhit">🃏 TIRER</button>
        <button class="hb" id="bjstand">✋ RESTER</button>
      </div></div>`;
  } else if (busy()) {
    bottom = `<div class="hint">⏳ Partie en cours…</div>`;
  } else if (panel === 'SHOP') {
    bottom = shopPanel();
  } else if (spot?.kind === 'SHOP') {
    bottom = `<div class="actionbar">
      <div class="abhead"><b>🛒 BOUTIQUE</b><small class="mdesc">Payée sur la cagnotte commune</small></div>
      <button class="go" id="openshop">VOIR LES OBJETS</button></div>`;
  } else if (spot?.kind === 'MACHINE') {
    const m = f.machines[spot.index];
    const occ = S.occupied?.[m.id];
    const icon: any = { WHEEL: '🎡', CRASH: '⚡', SLOTS: '🎰', HILO: '🃏', ROULETTE: '🎯', BLACKJACK: '♠️', CRAPS: '🎲', CHESTS: '🗿', PLINKO: '🔮' };
    if (occ) {
      bottom = `<div class="actionbar"><div class="abhead"><b>${icon[m.archetype]} ${m.name}</b></div>
        <div class="locked">🔒 Occupée par ${esc(occ)}</div></div>`;
    } else if (purse() < S.betMin) {
      bottom = `<div class="actionbar"><div class="abhead"><b>${icon[m.archetype]} ${m.name}</b></div>
        <div class="locked">Cagnotte insuffisante (mise min. ${fmt(S.betMin)}).</div></div>`;
    } else {
      ensureBet();
      let action = '';
      if (m.archetype === 'ROULETTE') {
        action = `<div class="hilobtns">
          <button class="hb opt red" data-o="RED">🔴 ROUGE<br><span class="mono">×2</span></button>
          <button class="hb opt" data-o="BLACK">⚫ NOIR<br><span class="mono">×2</span></button>
          <button class="hb opt green" data-o="GREEN">🟢 VERT<br><span class="mono">×36</span></button></div>`;
      } else if (m.archetype === 'CRAPS') {
        action = `<div class="hilobtns">
          <button class="hb opt" data-o="UNDER">⬇️ SOUS 7<br><span class="mono">×2.3</span></button>
          <button class="hb opt" data-o="SEVEN">🎯 PILE 7<br><span class="mono">×5.8</span></button>
          <button class="hb opt" data-o="OVER">⬆️ SUR 7<br><span class="mono">×2.3</span></button></div>`;
      } else if (m.archetype === 'CHESTS') {
        action = `<div class="grid9">${Array.from({ length: 9 }, (_, i) =>
          `<button class="cell opt" data-o="${i}">${i + 1}</button>`).join('')}</div>`;
      } else {
        const verb = m.archetype === 'CRASH' ? 'ENGAGER' : m.archetype === 'BLACKJACK' || m.archetype === 'HILO' ? 'JOUER' : 'MISER';
        action = `<button class="go" id="go">${icon[m.archetype]} ${verb} ${fmt(betVal)}</button>`;
      }
      bottom = `<div class="actionbar">
        <div class="abhead"><b>${icon[m.archetype]} ${m.name}</b><small class="mdesc">${m.desc}</small></div>
        ${betPad()}${action}</div>`;
    }
  } else {
    bottom = `<div class="hint">🕹️ Approche-toi d'une machine pour miser</div>`;
  }

  ui.innerHTML = `${topBar()}${sideList()}${bottom}`;

  bindBetPad(() => render());
  const go = $('#go');
  if (go) go.onclick = () => spot?.kind === 'MACHINE' && net.send({ t: 'bet', machineId: f.machines[spot.index].id, amount: betVal });
  ui.querySelectorAll('.opt').forEach(b => (b as HTMLElement).onclick = () => {
    if (spot?.kind === 'MACHINE') net.send({ t: 'bet', machineId: f.machines[spot.index].id, amount: betVal, opt: (b as HTMLElement).dataset.o });
  });
  const oc = $('#cashout'); if (oc) oc.onclick = () => net.send({ t: 'cashout' });
  const hi = $('#hi'); if (hi) hi.onclick = () => net.send({ t: 'hilo', choice: 'HI' });
  const lo = $('#lo'); if (lo) lo.onclick = () => net.send({ t: 'hilo', choice: 'LO' });
  const hc = $('#hcash'); if (hc) hc.onclick = () => net.send({ t: 'cashout' });
  const bh = $('#bjhit'); if (bh) bh.onclick = () => net.send({ t: 'bj', action: 'HIT' });
  const bs = $('#bjstand'); if (bs) bs.onclick = () => net.send({ t: 'bj', action: 'STAND' });
  const os = $('#openshop'); if (os) os.onclick = () => { panel = 'SHOP'; render(); };
  const cl = $('#closepanel'); if (cl) cl.onclick = () => { panel = 'NONE'; render(); };
  bindShop();
  bindQuit();
}

function shopPanel(): string {
  return `<div class="actionbar shoppanel">
    <div class="abhead"><b>🛒 BOUTIQUE</b><button class="close" id="closepanel">✕</button></div>
    <div class="shoplist">
      ${ITEMS.map(it => {
        const price = S.shopPrices?.[it.id] ?? 0;
        const has = it.scope === 'ÉQUIPE' && S.owned?.includes(it.id);
        const can = !has && S.bank >= price;
        return `<div class="sitem ${has ? 'has' : ''}">
          <div class="sic">${it.icon}</div>
          <div class="sinfo"><b>${it.name} <em>${it.scope}</em></b><span>${it.short}</span></div>
          <button class="sbuy" data-i="${it.id}" ${can ? '' : 'disabled'}>${has ? '✓' : fmt(price)}</button>
        </div>`;
      }).join('')}
    </div>
    <div class="shopfoot mono">Cagnotte : <b>${fmt(S.bank)}</b></div>
  </div>`;
}
function bindShop() {
  ui.querySelectorAll('.sbuy').forEach(b => (b as HTMLElement).onclick = () =>
    net.send({ t: 'buy', itemId: (b as HTMLElement).dataset.i }));
}

function sideList(): string {
  if (!S?.players?.length) return '';
  const rows = [...S.players].sort((a: any, b: any) => (b.net ?? 0) - (a.net ?? 0)).map((p: any) => {
    const n = p.net ?? 0, cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
    return `<div class="srow ${p.id === youId ? 'me' : ''}">
      <i style="background:${SKIN_COLORS[(p.color ?? 0) % 6]}"></i>
      <span class="sname">${esc(p.name)}</span>
      <b class="mono ${cls}">${fmtNet(n)}</b></div>`;
  }).join('');
  return `<div class="side">${rows}</div>`;
}

function topBar(): string {
  const pct = Math.min(100, (S.bank / S.toll) * 100);
  const canElev = S.phase === 'FLOOR' && S.bank >= S.toll;
  const items = (S.owned || []).map((id: string) => itemAt(id)?.icon || '').join('');
  return `<div class="top">
    <div class="row">
      <span class="floor">${floorAt(S.floor).theme.emoji} Étage ${S.floor} ${items ? `<span class="owned">${items}</span>` : ''}</span>
      <span><span class="timer mono" id="timer">${fmtT(remain())}</span><button class="quit" id="quit">✕</button></span>
    </div>
    <div class="row">
      <span class="bank mono" id="bank">${fmt(bankShown)}</span>
      <span class="banklab">cagnotte commune</span>
    </div>
    <div class="tollbar"><i style="width:${pct}%"></i></div>
    <div class="tolltxt mono"><span>Péage</span><span id="tollv">${fmt(S.bank)} / ${fmt(S.toll)}</span></div>
    ${canElev ? `<button class="elevbtn" id="elev">🛗 APPELER L'ASCENSEUR</button>` : ''}
  </div>`;
}

function bindQuit() {
  const q = $('#quit');
  if (q) q.onclick = () => { if (confirm('Quitter la table ?')) { net.forget(); location.reload(); } };
  const e = $('#elev'); if (e) e.onclick = () => net.send({ t: 'elevator' });
}

function softUpdate() {
  const t = $('#timer'); if (t) t.textContent = fmtT(remain());
  const bar = ui.querySelector('.tollbar i') as HTMLElement | null;
  if (bar) bar.style.width = `${Math.min(100, (S.bank / S.toll) * 100)}%`;
  const tv = $('#tollv'); if (tv) tv.textContent = `${fmt(S.bank)} / ${fmt(S.toll)}`;
  const side = $('.side'); if (side) side.outerHTML = sideList();
  if (S.phase === 'FLOOR') {
    if ((S.bank >= S.toll) !== !!$('#elev')) return render();
    if (panel !== 'NONE') return render();           // prix de la boutique
    if (!busy() && $('.hint')?.textContent?.includes('en cours')) return render();
  }
}

setInterval(() => {
  if (!S) return;
  if (Math.abs(bankShown - S.bank) > .5) {
    bankShown += (S.bank - bankShown) * .18;
    if (Math.abs(bankShown - S.bank) < 1) bankShown = S.bank;
    const b = $('#bank'); if (b) b.textContent = fmt(bankShown);
  }
  if (myCrash) {
    const mult = Math.pow(myCrash.growth, Math.max(0, (now() - myCrash.startAt) / myCrash.tickMs));
    const el = $('#mult'); if (el) el.textContent = '×' + mult.toFixed(2);
  }
  if (anyCrash) setCrashMult(Math.pow(anyCrash.growth, Math.max(0, (now() - anyCrash.startAt) / anyCrash.tickMs)));
}, 90);

const pf = Number(new URLSearchParams(location.search).get('floor'));
if (pf >= 1 && pf <= 5) setFloor(pf);

net.connect();
render();
