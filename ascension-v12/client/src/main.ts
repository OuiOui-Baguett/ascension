// ============================================================
// Client — monde 3D, cagnotte commune, boutique, mise à la main.
// ============================================================
import { net } from './net';
import {
  initScene, setFloor, setPlayers, setRemotePos, setMoveInput, getMyPos, nearestSpot,
  wheelSpinTo, slotsSpinTo, hiloShowCard, rouletteSpinTo, crapsRollTo, bjShow,
  chestsOpen, plinkoDropTo, setCrashMult, crashCashFx, crashBustFx,
  coinBurst, floatText, bumpShake, slotWinFx, showEmote, setCinematic,
  minesReveal, minesReset, raceRunTo, type Spot,
} from './scene';
import { initAudio, play, setAmbient, stopAmbient, toggleMute, isMuted } from './audio';
import {
  FLOORS, floorAt, ITEMS, itemAt, fmt, CARD_NAMES, SKIN_COLORS, HATS, EMOTES, MAX_PLAYERS,
  minesMult, raceOdds,
} from '../../shared/content';

const ui = document.getElementById('ui')!;
let S: any = null, youId = '', timeOffset = 0;
let joined = false, connected = false;
let bankShown = 0, betVal = 0;
let spot: Spot | null = null, spotKey = '';
let myCrash: any = null, anyCrash: any = null, myHilo: any = null, myBJ: any = null, myMines: any = null;
let panel: 'NONE' | 'SHOP' | 'MACHINE' = 'NONE';
let scoreOpen = false, emoteOpen = false, lastTick = -1;
let balls = 1;               // plinko : nombre de billes à lâcher
let homeFloor = 1;           // étage prévisualisé derrière l'écran-titre
let name = localStorage.getItem('ascension_name') || '';
let skinColor = Number(localStorage.getItem('ascension_color') || 0);
let skinHat = Number(localStorage.getItem('ascension_hat') || 0);

const $ = (s: string) => ui.querySelector(s) as HTMLElement | null;
const now = () => Date.now() + timeOffset;
const vibrate = (ms: number) => navigator.vibrate?.(ms);
const esc = (s: string) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

initScene(document.getElementById('scene') as HTMLCanvasElement);

// iOS n'autorise le son qu'après un geste : on débloque au tout premier appui,
// quel qu'il soit (utile aussi quand on revient via une reconnexion automatique).
addEventListener('pointerdown', () => initAudio(), { once: true });
addEventListener('keydown', () => initAudio(), { once: true });

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
// on reste libre de ses mouvements ; seule une partie en cours immobilise.
// s'éloigner referme automatiquement le panneau (voir la boucle de proximité).
const canWalk = () => joined && S && S.phase === 'FLOOR' && !myCrash && !myHilo && !myBJ && !myMines;

setInterval(() => {
  const v = canWalk() ? inputVec() : { x: 0, z: 0 };
  setMoveInput(v.x, v.z);
  stick.style.display = canWalk() ? 'block' : 'none';
  // joystick ET barre d'émotes se replacent au-dessus du panneau du bas,
  // quelle que soit sa hauteur (elle varie selon la machine).
  const bar = ui.querySelector('.actionbar, .hint') as HTMLElement | null;
  const h = bar ? bar.getBoundingClientRect().height + 26 : 130;
  stick.style.bottom = `calc(${Math.round(h)}px + env(safe-area-inset-bottom))`;
  const emo = ui.querySelector('.emobar') as HTMLElement | null;
  if (emo) emo.style.bottom = `calc(${Math.round(h - 12)}px + env(safe-area-inset-bottom))`;
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
    panel = 'NONE';                 // on s'éloigne → on referme
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
net.on('emote', m => { showEmote(m.id, EMOTES[m.i] ?? '👍'); play('emote'); });

const idxOf = (id: string) => Math.max(0, floorAt(S.floor).machines.findIndex((m: any) => m.id === id));

net.on('ev', m => {
  if (m.kind === 'reject') { toast(m.text); vibrate(40); return; }
  if (m.text) toast(m.text);
  const i = m.machineId ? idxOf(m.machineId) : 0;
  const mine = m.playerId === youId;
  switch (m.kind) {
    case 'wheel_spin': wheelSpinTo(m.mult, m.spinMs); play('lever'); break;
    case 'slots_spin':
      slotsSpinTo(m.symbols, m.spinMs); play('lever');
      // un clac par rouleau qui se cale
      [.5, .75, 1].forEach((f, k) => setTimeout(() => play('reelStop'), m.spinMs * f + k * 40));
      break;
    case 'roulette_spin':
      rouletteSpinTo(m.color, m.spinMs); play('lever');
      for (let k = 0; k < 14; k++) setTimeout(() => play('click'), 200 + k * (m.spinMs / 16));
      break;
    case 'craps_roll': crapsRollTo(m.d1, m.d2, m.rollMs); play('dice'); break;
    case 'chests_open': chestsOpen(m.pick, m.reveal, m.openMs); play('chest'); break;
    case 'plinko_drop': {
      const dr = m.drops ?? [{ path: m.path, slot: m.slot }];
      plinkoDropTo(dr, m.dropMs, m.stagger ?? 0);
      dr.forEach((_: any, k: number) => setTimeout(() => play('ball'), k * (m.stagger ?? 0)));
      break;
    }
    case 'jackpot': play('jackpot'); bumpShake(1.8); coinBurst(i, 60); floatText(i, '🎰 JACKPOT', '#ffe9a8', true); break;
    case 'crash_start':
      anyCrash = { startAt: m.startAt, growth: m.growth, tickMs: m.tickMs };
      if (mine) { myCrash = { ...anyCrash, bet: m.bet, idx: i }; render(); }
      break;
    case 'hilo_start':
      hiloShowCard(m.card); play('card');
      if (mine) { myHilo = { card: m.card, mult: 1, steps: 0 }; render(); }
      break;
    case 'hilo_card':
      hiloShowCard(m.card); play('card'); play('tick');
      floatText(i, `✓ ×${m.mult}`, '#7ee08a');
      if (mine) { myHilo = { card: m.card, mult: m.mult, steps: m.steps }; render(); }
      break;
    case 'hilo_bust': hiloShowCard(m.card); play('card'); if (mine) { myHilo = null; render(); } break;
    case 'mines_start':
      minesReset(); play('card');
      if (mine) { myMines = { opened: [], mult: 1, cells: m.cells, bombs: m.bombs }; render(); }
      break;
    case 'mines_safe':
      minesReveal(m.cell, false); play('tick');
      floatText(i, `✓ ×${m.mult}`, '#7ee08a');
      if (mine && myMines) { myMines.opened.push(m.cell); myMines.mult = m.mult; render(); }
      break;
    case 'mines_boom':
      minesReveal(m.cell, true);
      for (const b of m.bombs ?? []) if (b !== m.cell) minesReveal(b, true);
      play('bust'); bumpShake(1.4); vibrate(120);
      if (mine) { myMines = null; render(); }
      break;
    case 'mines_end':
      for (const b of m.bombs ?? []) minesReveal(b, true);
      if (mine) { myMines = null; render(); }
      break;
    case 'race_start':
      raceRunTo(m.order, m.raceMs); play('lever');
      break;
    case 'bj_start': bjShow(String(m.total), String(m.dealerCard)); play('card'); if (mine) { myBJ = { total: m.total, dealerCard: m.dealerCard }; render(); } break;
    case 'bj_card': bjShow(String(m.total), mine && myBJ ? String(myBJ.dealerCard) : '?'); play('card'); if (mine) { myBJ = { total: m.total, dealerCard: myBJ?.dealerCard ?? 0 }; render(); } break;
    case 'bj_bust': bjShow(String(m.total), '—'); if (mine) { myBJ = null; render(); } break;
    case 'bj_result': bjShow(String(m.total), String(m.dealerTotal)); if (mine) { myBJ = null; render(); } break;
    case 'buy': play('buy'); break;
    case 'toll': play('ding'); break;
    case 'fall': bumpShake(2.2); vibrate(300); play('fall'); stopAmbient(); break;
    case 'victory': play('victory'); break;
  }
  // résultats génériques (gagné / perdu) — un seul chemin
  if (m.kind === 'slots_win') slotWinFx();
  if (m.kind.endsWith('_win')) {
    const big = (m.mult ?? 0) >= 5 || m.win >= (S?.betMax ?? 0) * 3;
    coinBurst(i, m.win > 0 ? 24 : 12);
    floatText(i, `+${fmt(m.win)}`, '#7ee08a', big);
    bumpShake(.5);
    if (m.kind !== 'jackpot') play(big ? 'bigWin' : 'win');
    if (mine) { myCrash = null; myHilo = null; myBJ = null; myMines = null; render(); }
  } else if (m.kind.endsWith('_lose')) {
    const isCrash = (m.kind || '').includes('crash');
    floatText(i, '✗', '#e05c5c', isCrash);
    if (isCrash) { crashBustFx(); play('bust'); } else { vibrate(70); play('lose'); }
    if (mine) { myCrash = null; myHilo = null; myBJ = null; myMines = null; render(); }
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
    if (state.phase !== 'FLOOR') { myCrash = myHilo = myBJ = myMines = anyCrash = null; setCrashMult(null); panel = 'NONE'; }
    // ambiance sonore : une couleur par étage, coupée hors jeu
    if (state.phase === 'FLOOR') setAmbient(state.floor);
    else if (state.phase !== 'BRIEFING') stopAmbient();
    if (state.phase === 'ELEVATOR') play('ding');
    lastTick = -1;
    betVal = 0;
    render();
  } else if (state.phase === 'LOBBY') {
    // le salon change sans changement de phase : un joueur entre ou sort de la table
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
const busy = () => !!me()?.playing || !!myCrash || !!myHilo || !!myBJ || !!myMines;

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
  setCinematic(false);
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

const HAT_ICON = ['—', '🧢', '👑', '🎩', '📡', '😇'];

function renderHome() {
  // Écran-titre : le casino tourne derrière, on prévisualise l'étage choisi.
  setCinematic(true);
  setFloor(homeFloor);
  ui.innerHTML = `
    <div class="home">
      <button class="mutebtn home-mute" id="mute">${isMuted() ? '🔇' : '🔊'}</button>

      <div class="brand">
        <div class="mark">▲</div>
        <h1 class="logo">ASCENSION</h1>
        <div class="tag">5 étages · une cagnotte commune · jusqu'à ${MAX_PLAYERS} joueurs</div>
      </div>

      <div class="bottom">
      <div class="strip" id="strip">
        ${FLOORS.map(f => `
          <button class="fchip${f.index === homeFloor ? ' sel' : ''}" data-f="${f.index}" title="${esc(f.sub)}">
            <span class="fe">${f.theme.emoji}</span>
            <span class="fn">${esc(f.name)}</span>
            <span class="fx">×${f.mult}</span>
          </button>`).join('')}
      </div>

      <div class="card">
        <div class="idrow">
          <div class="ava" id="ava" style="background:${SKIN_COLORS[skinColor % 8]}">
            <span class="avahat">${skinHat ? HAT_ICON[skinHat] : ''}</span>
          </div>
          <input class="field flat" id="name" maxlength="14" placeholder="TON NOM" value="${esc(name)}">
        </div>

        <div class="skinrow" id="cols">
          ${SKIN_COLORS.map((c, i) => `<button class="sw${i === skinColor ? ' sel' : ''}" data-c="${i}" style="background:${c}"></button>`).join('')}
        </div>
        <div class="skinrow" id="hats">
          ${HATS.map(h => `<button class="ht${h.id === skinHat ? ' sel' : ''}" data-h="${h.id}">${HAT_ICON[h.id]}</button>`).join('')}
        </div>

        <button class="btn play" id="create">▶ &nbsp;CRÉER UNE TABLE</button>

        <div class="sep"><span>ou rejoins tes potes</span></div>
        <div class="joinrow">
          <input class="field code4" id="code" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off" spellcheck="false">
          <button class="btn ghost" id="join">REJOINDRE</button>
        </div>
      </div>

      <div class="foot">Un seul téléphone par joueur · aucune installation</div>
      </div>
    </div>`;

  const ne = $('#name') as HTMLInputElement;
  ne.oninput = () => { name = ne.value; localStorage.setItem('ascension_name', name); };

  // On met à jour la sélection à la main : un re-render effacerait le nom en cours de frappe.
  const ava = $('#ava')!;
  ui.querySelectorAll('.sw').forEach(b => (b as HTMLElement).onclick = () => {
    skinColor = Number((b as HTMLElement).dataset.c);
    localStorage.setItem('ascension_color', String(skinColor));
    ui.querySelectorAll('.sw').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    ava.style.background = SKIN_COLORS[skinColor % 8];
    initAudio(); play('tap');
  });
  ui.querySelectorAll('.ht').forEach(b => (b as HTMLElement).onclick = () => {
    skinHat = Number((b as HTMLElement).dataset.h);
    localStorage.setItem('ascension_hat', String(skinHat));
    ui.querySelectorAll('.ht').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    ava.querySelector('.avahat')!.textContent = skinHat ? HAT_ICON[skinHat] : '';
    initAudio(); play('tap');
  });
  ui.querySelectorAll('.fchip').forEach(b => (b as HTMLElement).onclick = () => {
    homeFloor = Number((b as HTMLElement).dataset.f);
    ui.querySelectorAll('.fchip').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    setFloor(homeFloor);
    initAudio(); play('tap'); setAmbient(homeFloor);
  });

  $('#create')!.onclick = () => {
    initAudio();
    if (!name.trim()) return toast('Entre ton nom d’abord.');
    net.forget(); net.send({ t: 'create', name, color: skinColor, hat: skinHat });
  };
  const mb = $('#mute');
  if (mb) mb.onclick = () => { initAudio(); const m = toggleMute(); mb.textContent = m ? '🔇' : '🔊'; if (!m) play('tap'); };

  const ce = $('#code') as HTMLInputElement;
  // les codes mêlent lettres ET chiffres (ABCDEFGHJKMNPQRSTUVWXYZ23456789)
  ce.oninput = () => { ce.value = ce.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  ce.onkeydown = e => { if (e.key === 'Enter') $('#join')!.click(); };
  $('#join')!.onclick = () => {
    initAudio();
    if (!name.trim()) return toast('Entre ton nom d’abord.');
    const code = ce.value.trim().toUpperCase();
    if (code.length !== 4) return toast('Code à 4 caractères.');
    net.forget(); net.send({ t: 'join', code, name, color: skinColor, hat: skinHat });
  };
}

function renderLobby() {
  const seats = Array.from({ length: MAX_PLAYERS }, (_, i) => S.players[i] ?? null);
  ui.innerHTML = `
    <div class="screen lobby">
      <p class="lbl">CODE DE LA TABLE</p>
      <div class="code">${S.code}</div>
      <p>Tes potes entrent ce code sur leur téléphone.</p>
      <div class="seats">
        ${seats.map((p: any, i: number) => p
          ? `<div class="seat taken">
               <span class="pin" style="background:${SKIN_COLORS[p.color % 8]}"></span>
               <span class="pn">${esc(p.name)}</span>${p.connected ? '' : '<span class="pw">⚡</span>'}
             </div>`
          : `<div class="seat"><span class="pn">Place ${i + 1}</span></div>`).join('')}
      </div>
      <p class="tip">${S.players.length} / ${MAX_PLAYERS} joueurs · jouable même en solo</p>
      <button class="btn play" id="start">LANCER LA PARTIE</button>
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
/** Palmarès : les titres décernés à l'équipe, calculés par le serveur. */
function awardsHtml(): string {
  const a = S.awards || [];
  if (!a.length) return '';
  return `<div class="awards">
    ${a.map((w: any) => `<div class="award">
      <span class="aic">${w.icon}</span>
      <span class="atxt"><b>${w.label}</b><em>${esc(w.name)}</em></span>
      <span class="aval mono">${fmt(w.value)}</span>
    </div>`).join('')}
  </div>`;
}

function renderFalling() {
  ui.innerHTML = `<div class="screen fall-screen">
    <div class="big">🕳️</div><h1>LA CHUTE</h1>
    <p>La tour vous regarde.<br>Retour à l'étage 1.</p>
    ${awardsHtml()}</div>`;
}
function renderVictory() {
  const st = S.stats;
  const mins = Math.max(1, Math.round((Date.now() - st.startedAt) / 60000));
  ui.innerHTML = `
    <div class="screen victory-screen">
      <div class="big">👑</div><h1>LA DERNIÈRE PORTE</h1>
      <p>Vous êtes arrivés au bout de la tour.</p>
      <div class="stats mono">
        <div>Cagnotte finale : <b>${fmt(S.bank)}</b></div>
        <div>Plus gros gain : ${fmt(st.biggestWin)}</div>
        <div>Chutes : ${st.falls} · Durée : ${mins} min</div>
      </div>
      ${awardsHtml()}
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
        <button class="hb" id="lo" ${pLo <= 0 ? 'disabled' : ''}>⬇️ PLUS BAS<br><span class="mono">×${pLo > 0 ? (1 / pLo).toFixed(2) : '—'}</span></button>
        <button class="hb" id="hi" ${pHi <= 0 ? 'disabled' : ''}>⬆️ PLUS HAUT<br><span class="mono">×${pHi > 0 ? (1 / pHi).toFixed(2) : '—'}</span></button>
      </div>
      <button class="go" id="hcash" ${myHilo.steps === 0 ? 'disabled' : ''}>💰 ENCAISSER ×${myHilo.mult.toFixed(2)}</button></div>`;
  } else if (myMines) {
    const nextMult = minesMult({ cells: myMines.cells, bombs: myMines.bombs, edge: 0 }, myMines.opened.length + 1);
    bottom = `<div class="actionbar">
      <div class="hilohead mono">${myMines.opened.length} sûres · ×${myMines.mult.toFixed(2)} <small>(suivante ×${nextMult.toFixed(2)})</small></div>
      <div class="grid25">${Array.from({ length: myMines.cells }, (_, k) =>
        `<button class="mcell${myMines.opened.includes(k) ? ' safe' : ''}" data-m="${k}" ${myMines.opened.includes(k) ? 'disabled' : ''}>${myMines.opened.includes(k) ? '✓' : ''}</button>`).join('')}</div>
      <button class="go" id="mcash" ${myMines.opened.length === 0 ? 'disabled' : ''}>💰 ENCAISSER ×${myMines.mult.toFixed(2)}</button></div>`;
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
    const icon: any = { WHEEL: '🎡', CRASH: '⚡', SLOTS: '🎰', HILO: '🃏', ROULETTE: '🎯', BLACKJACK: '♠️', CRAPS: '🎲', CHESTS: '💎', PLINKO: '🔮', MINES: '💣', RACE: '🏁' };
    const RULES: any = {
      WHEEL: 'Une seule rotation. Le segment sous le repère paie ta mise.',
      CRASH: 'Le multiplicateur monte en continu. Encaisse avant la rupture.',
      SLOTS: '3 rouleaux. Deux symboles identiques paient, trois paient gros.',
      HILO: 'Devine si la carte suivante est plus haute ou plus basse. Encaisse quand tu veux.',
      ROULETTE: 'Mise sur une couleur. Rouge et noir paient un peu plus que double, le vert ×37.',
      BLACKJACK: 'Approche 21 sans dépasser. Le croupier tire jusqu’à 17.',
      CRAPS: 'Deux dés. Parie sur un total sous 7, égal à 7, ou au-dessus.',
      CHESTS: '9 caisses, une seule à ouvrir. Quatre sont vides.',
      PLINKO: 'La bille dévale les picots. Les cases des bords paient ×19.',
      MINES: '25 cases, 3 bombes. Chaque case sûre monte le gain — encaisse avant la mauvaise.',
      RACE: '4 partants, un seul gagne. Le favori paie peu, l’outsider paie gros.',
    };
    if (occ) {
      bottom = `<div class="actionbar"><div class="abhead"><b>${icon[m.archetype]} ${m.name}</b></div>
        <div class="locked">🔒 Machine occupée par ${esc(occ)}</div></div>`;
    } else if (panel !== 'MACHINE') {
      // écran d'accueil de la machine : rien ne se lance sans un appui volontaire
      bottom = `<div class="actionbar">
        <div class="mcard">
          <div class="micon">${icon[m.archetype]}</div>
          <div class="minfo"><b>${m.name}</b><span>${RULES[m.archetype]}</span></div>
        </div>
        <div class="mmeta mono">Mise ${fmt(S.betMin)} → ${fmt(S.betMax)}</div>
        <button class="go" id="openmachine">▶️ JOUER À CETTE MACHINE</button>
      </div>`;
    } else if (purse() < S.betMin) {
      bottom = `<div class="actionbar"><div class="abhead"><b>${icon[m.archetype]} ${m.name}</b><button class="close" id="closepanel">✕</button></div>
        <div class="locked">Cagnotte insuffisante (mise min. ${fmt(S.betMin)}).</div></div>`;
    } else {
      ensureBet();
      let action = '';
      if (m.archetype === 'ROULETTE') {
        const ro = m.roulette!;
        action = `<div class="lbl">Choisis ta couleur</div>
        <div class="hilobtns">
          <button class="hb opt red" data-o="RED">🔴 ROUGE<br><span class="mono">×${ro.colorMult}</span></button>
          <button class="hb opt" data-o="BLACK">⚫ NOIR<br><span class="mono">×${ro.colorMult}</span></button>
          <button class="hb opt green" data-o="GREEN">🟢 VERT<br><span class="mono">×${ro.greenMult}</span></button></div>`;
      } else if (m.archetype === 'CRAPS') {
        const cr = m.craps!;
        action = `<div class="lbl">Choisis ton pari</div>
        <div class="hilobtns">
          <button class="hb opt" data-o="UNDER">⬇️ SOUS 7<br><span class="mono">×${cr.sideMult}</span></button>
          <button class="hb opt" data-o="SEVEN">🎯 PILE 7<br><span class="mono">×${cr.sevenMult}</span></button>
          <button class="hb opt" data-o="OVER">⬆️ SUR 7<br><span class="mono">×${cr.sideMult}</span></button></div>`;
      } else if (m.archetype === 'CHESTS') {
        action = `<div class="lbl">Choisis une caisse — 4 sur 9 sont vides</div>
        <div class="grid9">${Array.from({ length: 9 }, (_, k) =>
          `<button class="cell opt" data-o="${k}"><span class="cn">${k + 1}</span><span class="cb">📦</span></button>`).join('')}</div>`;
      } else if (m.archetype === 'RACE') {
        const rc = m.race!;
        action = `<div class="lbl">Sur qui tu mises ?</div>
        <div class="runners">${rc.runners.map((r, k) =>
          `<button class="rn opt" data-o="${k}"><span class="ri">${r.icon}</span><span class="rnm">${esc(r.name)}</span><span class="rc mono">×${raceOdds(rc, k)}</span></button>`).join('')}</div>`;
      } else if (m.archetype === 'PLINKO') {
        const maxB = m.plinko?.maxBalls ?? 5;
        const total = betVal * balls;
        const tooMuch = total > S.betMax || total > S.bank;
        action = `<div class="lbl">Combien de billes ? (${fmt(betVal)} chacune)</div>
        <div class="balls">
          ${Array.from({ length: maxB }, (_, k) => k + 1).map(nb =>
            `<button class="bq ${nb === balls ? 'sel' : ''}" data-b="${nb}">${'●'.repeat(nb)}</button>`).join('')}
        </div>
        <button class="go" id="go" ${tooMuch ? 'disabled' : ''}>
          🔮 LÂCHER ${balls} BILLE${balls > 1 ? 'S' : ''} · ${fmt(total)}
        </button>
        ${tooMuch ? `<div class="warn mono">Total au-dessus de la limite (${fmt(S.betMax)})</div>` : ''}`;
      } else {
        const verb = m.archetype === 'CRASH' ? 'ENGAGER' : m.archetype === 'BLACKJACK' || m.archetype === 'HILO' ? 'DISTRIBUER'
          : m.archetype === 'SLOTS' ? 'LANCER' : m.archetype === 'MINES' ? 'ENTRER' : 'MISER';
        action = `<button class="go" id="go">${icon[m.archetype]} ${verb} ${fmt(betVal)}</button>`;
      }
      bottom = `<div class="actionbar">
        <div class="abhead"><b>${icon[m.archetype]} ${m.name}</b><button class="close" id="closepanel">✕</button></div>
        ${betPad()}${action}</div>`;
    }
  } else {
    bottom = `<div class="hint">🕹️ Approche-toi d'une machine pour miser</div>`;
  }

  ui.innerHTML = `${topBar()}${sideList()}${emoteBar()}${bottom}`;
  bindEmotes();

  bindBetPad(() => render());
  const go = $('#go');
  if (go) go.onclick = () => {
    if (spot?.kind !== 'MACHINE') return;
    const mm = f.machines[spot.index];
    play('tap');
    net.send({ t: 'bet', machineId: mm.id, amount: betVal, opt: mm.archetype === 'PLINKO' ? String(balls) : '' });
  };
  ui.querySelectorAll('.bq').forEach(b => (b as HTMLElement).onclick = () => {
    balls = Number((b as HTMLElement).dataset.b); play('tap'); render();
  });
  ui.querySelectorAll('.opt').forEach(b => (b as HTMLElement).onclick = () => {
    if (spot?.kind !== 'MACHINE') return;
    play('tap');
    net.send({ t: 'bet', machineId: f.machines[spot.index].id, amount: betVal, opt: (b as HTMLElement).dataset.o });
  });
  const oc = $('#cashout'); if (oc) oc.onclick = () => net.send({ t: 'cashout' });
  const hi = $('#hi'); if (hi) hi.onclick = () => net.send({ t: 'hilo', choice: 'HI' });
  const lo = $('#lo'); if (lo) lo.onclick = () => net.send({ t: 'hilo', choice: 'LO' });
  const hc = $('#hcash'); if (hc) hc.onclick = () => net.send({ t: 'cashout' });
  const mc = $('#mcash'); if (mc) mc.onclick = () => net.send({ t: 'cashout' });
  ui.querySelectorAll('.mcell').forEach(b => (b as HTMLElement).onclick = () => {
    play('tap'); net.send({ t: 'mines', cell: Number((b as HTMLElement).dataset.m) });
  });
  const bh = $('#bjhit'); if (bh) bh.onclick = () => net.send({ t: 'bj', action: 'HIT' });
  const bs = $('#bjstand'); if (bs) bs.onclick = () => net.send({ t: 'bj', action: 'STAND' });
  const os = $('#openshop'); if (os) os.onclick = () => { panel = 'SHOP'; render(); };
  const om = $('#openmachine'); if (om) om.onclick = () => { panel = 'MACHINE'; betVal = 0; render(); };
  const cl = $('#closepanel'); if (cl) cl.onclick = () => { panel = 'NONE'; render(); };
  bindShop();
  bindSide();
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
  const sorted = [...S.players].sort((a: any, b: any) => (b.net ?? 0) - (a.net ?? 0));
  const rows = sorted.map((p: any, rank: number) => {
    const n = p.net ?? 0, cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
    const crown = rank === 0 && n > 0 ? '<em class="crown">👑</em>' : '';
    const detail = scoreOpen ? `<div class="sdet mono">
        <span>misé ${fmtNet(-(p.wagered ?? 0)).replace('−', '')}</span>
        <span>gagné ${fmtNet(p.won ?? 0).replace('+', '')}</span>
        ${p.spent ? `<span>boutique ${fmtNet(p.spent).replace('+', '')}</span>` : ''}
        <span>${p.plays ?? 0} coups</span>
      </div>` : '';
    return `<div class="srow ${p.id === youId ? 'me' : ''} ${scoreOpen ? 'open' : ''}">
      <div class="sline">
        <i style="background:${SKIN_COLORS[(p.color ?? 0) % 8]}"></i>
        <span class="sname">${crown}${esc(p.name)}</span>
        <b class="mono ${cls}">${fmtNet(n)}</b>
      </div>${detail}</div>`;
  }).join('');
  return `<div class="side ${scoreOpen ? 'open' : ''}" id="side">
    ${scoreOpen ? '<div class="shead mono">BILANS · gains − mises</div>' : ''}
    ${rows}</div>`;
}
function bindSide() {
  const el = $('#side');
  if (el) el.onclick = () => { scoreOpen = !scoreOpen; const s2 = $('#side'); if (s2) s2.outerHTML = sideList(); bindSide(); };
}

function topBar(): string {
  const pct = Math.min(100, (S.bank / S.toll) * 100);
  const canElev = S.phase === 'FLOOR' && S.bank >= S.toll;
  const items = (S.owned || []).map((id: string) => itemAt(id)?.icon || '').join('');
  const r = remain();
  const hot = S.phase === 'FLOOR' && r <= 45 && !canElev;   // dernière ligne droite
  return `<div class="top ${hot ? 'hot' : ''}">
    <div class="row">
      <span class="floor">${floorAt(S.floor).theme.emoji} Étage ${S.floor} ${items ? `<span class="owned">${items}</span>` : ''}</span>
      <span><span class="timer mono ${hot ? 'hot' : ''}" id="timer">${fmtT(r)}</span><button class="quit" id="quit">✕</button></span>
    </div>
    <div class="row">
      <span class="bank mono" id="bank">${fmt(bankShown)}</span>
      <span class="banklab">cagnotte commune</span>
    </div>
    <div class="tollbar ${pct > 80 ? 'near' : ''}"><i style="width:${pct}%"></i></div>
    <div class="tolltxt mono">
      <span>Péage</span>
      ${S.jackpot ? `<span class="jack">🎰 ${fmt(S.jackpot)}</span>` : ''}
      <span id="tollv">${fmt(S.bank)} / ${fmt(S.toll)}</span>
    </div>
    ${canElev ? `<button class="elevbtn" id="elev">🛗 APPELER L'ASCENSEUR</button>` : ''}
  </div>`;
}

/** Barre d'émotes : la vie sociale du jeu. */
function emoteBar(): string {
  return `<div class="emobar ${emoteOpen ? 'open' : ''}" id="emobar">
    ${emoteOpen ? EMOTES.map((e, i) => `<button class="emo" data-e="${i}">${e}</button>`).join('') : ''}
    <button class="emotoggle" id="emotoggle">${emoteOpen ? '✕' : '💬'}</button>
  </div>`;
}
function bindEmotes() {
  const t = $('#emotoggle');
  if (t) t.onclick = () => { emoteOpen = !emoteOpen; play('tap'); render(); };
  ui.querySelectorAll('.emo').forEach(b => (b as HTMLElement).onclick = () => {
    net.send({ t: 'emote', i: Number((b as HTMLElement).dataset.e) });
    emoteOpen = false; render();
  });
}

function bindQuit() {
  const q = $('#quit');
  if (q) q.onclick = () => { if (confirm('Quitter la table ?')) { net.forget(); location.reload(); } };
  const e = $('#elev'); if (e) e.onclick = () => net.send({ t: 'elevator' });
}

function softUpdate() {
  const r = remain();
  const t = $('#timer'); if (t) t.textContent = fmtT(r);
  // compte à rebours sonore de la dernière ligne droite
  if (S.phase === 'FLOOR' && r !== lastTick) {
    if (r <= 5 && r > 0) play('tickHot');
    else if (r <= 30 && r > 5 && r % 5 === 0) play('tick');
    if (r === 45 || r === 30) { toast(`⏳ Plus que ${r} secondes !`); }
    lastTick = r;
  }
  const hot = S.phase === 'FLOOR' && r <= 45 && S.bank < S.toll;
  const top = ui.querySelector('.top');
  if (top && hot !== top.classList.contains('hot')) return render();
  const bar = ui.querySelector('.tollbar i') as HTMLElement | null;
  if (bar) bar.style.width = `${Math.min(100, (S.bank / S.toll) * 100)}%`;
  const tv = $('#tollv'); if (tv) tv.textContent = `${fmt(S.bank)} / ${fmt(S.toll)}`;
  const side = $('#side'); if (side) { side.outerHTML = sideList(); bindSide(); }
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

// Sonde de test : les scénarios automatisés pilotent le déplacement à la position réelle.
(window as any).__pos = getMyPos;

const pf = Number(new URLSearchParams(location.search).get('floor'));
if (pf >= 1 && pf <= 5) { homeFloor = pf; setFloor(pf); }

net.connect();
render();
