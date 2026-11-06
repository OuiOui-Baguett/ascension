// ============================================================
// FISH & FURY — interface. Le module est chargé À LA DEMANDE par la
// coquille : tant qu'on ne choisit pas ce jeu, rien de tout ça n'est téléchargé.
// ============================================================
import {
  initFishScene, teardownFish, setPlayers, setRemotePos, setMoveInput, getMyPos,
  atWater, nearMarket, nearShop, castTo, setFight, endLine, splash, floatText, bump,
  bobberAt, MARKET_POS, SHOP_POS, fishDebug, forcePos, setSoaked, setWalkScale,
} from './scene';
import * as THREE from 'three';
import {
  FISHES, RODS, BAITS, RARITY, fishAt, rodAt, baitAt, variantAt, fishValue, fmtShells,
} from '../../../shared/fish';

export interface FishCtx {
  ui: HTMLElement;
  send: (m: any) => void;
  play: (n: any) => void;
  initAudio: () => void;
  esc: (s: string) => string;
  toast: (s: string) => void;
  vibrate: (ms: number) => void;
  rerender: () => void;
}

export function mountFish(ctx: FishCtx) {
  const cv = document.createElement('canvas');
  cv.id = 'scene-fish';
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.insertBefore(cv, document.body.firstChild);
  initFishScene(cv);
  (window as any).__fish = fishDebug;
  // ferrer une espèce à la demande — ne marche que si le serveur tourne avec DEBUG=1
  (window as any).__ferrer = (id: string, kg?: number) => ctx.send({ t: 'dbgfish', id, kg });

  let S: any = null, youId = '';
  let panel: 'NONE' | 'BAG' | 'SHOP' = 'NONE';
  let holding = false, holdStart = 0, holdPower = 0;
  let reeling = false;
  let tension = 0, distance = 100, surge = 0;
  let crossedUntil = 0;      // lignes emmêlées : mouliner coûte double
  const $ = (s: string) => ctx.ui.querySelector(s) as HTMLElement | null;
  /** Le son ne doit JAMAIS faire tomber une action de jeu. */
  const safeAudio = () => { try { ctx.initAudio(); } catch { /* pas de son, tant pis */ } };
  const me = () => S?.players?.find((p: any) => p.id === youId);
  const you = () => S?.you;

  // la jauge de charge et la tension bougent trop vite pour un re-rendu complet
  const raf = () => {
    const bar = $('#castbar');
    if (bar && holding) {
      holdPower = Math.min(1, (Date.now() - holdStart) / 1200);
      bar.style.width = `${Math.round(holdPower * 100)}%`;
    }
    const tb = $('#tens');
    if (tb) {
      tb.style.width = `${Math.min(100, tension)}%`;
      tb.className = 'tensfill' + (tension > 78 ? ' danger' : tension > 52 ? ' warn' : '');
    }
    const db = $('#dist');
    if (db) db.style.width = `${Math.max(0, 100 - distance)}%`;
    watchZone();
    frame = requestAnimationFrame(raf);
  };

  // La barre d'action dépend de l'ENDROIT où on est (eau, marché, boutique) — or le
  // serveur n'envoie rien quand on marche. Sans cette veille, on arrive au bord de
  // l'eau et le bouton LANCER n'apparaît jamais : on croit que le jeu est cassé.
  let zoneKey = '', lastSec = 0;
  function watchZone() {
    if (!S || S.phase !== 'PLAYING') return;
    const st = you()?.stage;
    // décompte de la baignade + bandeau « emmêlé » : une seconde de granularité suffit
    if (st === 'SOAKED' || crossedUntil > Date.now() - 400) {
      const sec = Math.ceil(Date.now() / 500);
      if (sec !== lastSec) { lastSec = sec; render(); }
      return;
    }
    if (panel !== 'NONE') return;
    if (holding || reeling || st !== 'IDLE') return;
    const k = nearMarket() ? 'M' : nearShop() ? 'S' : atWater() ? 'W' : '-';
    if (k === zoneKey) return;
    zoneKey = k;
    render();
  }
  let frame = requestAnimationFrame(raf);

  function rarityChip(id: string) {
    const f = fishAt(id); if (!f) return '';
    const r = RARITY[f.rarity];
    return `<span class="rar" style="color:${r.color};border-color:${r.color}55">${r.label}</span>`;
  }

  function topBar() {
    const y = you();
    const shells = y?.shells ?? 0;
    const bag = y?.bag?.length ?? 0;
    return `<div class="top fishtop">
      <div class="row">
        <div class="floor">🎣 La Crique · ${S.code}</div>
        <button class="quit" id="quit">✕</button>
      </div>
      <div class="row">
        <div class="bank">${fmtShells(shells)}</div>
        <div class="fishmeta mono">
          <button class="bagbtn" id="openbag">🧺 ${bag}/6</button>
          <span>${y?.dex?.length ?? 0}/${FISHES.length} espèces</span>
        </div>
      </div>
    </div>`;
  }

  function sideList() {
    const ps = (S.players ?? []).slice().sort((a: any, b: any) => b.shells - a.shells);
    return `<div class="side fishside" id="side">
      ${ps.map((p: any) => `<div class="srow">
        <span class="dot" style="background:${['#e6b64c','#4aa8dc','#e05c5c','#5cb46e','#b07de0','#e08a3e','#3fd0c9','#f07ab0'][p.color % 8]}"></span>
        <span class="sname">${ctx.esc(p.name)}</span>
        <span class="sval mono">${p.catches}🐟</span>
      </div>`).join('')}
    </div>`;
  }

  function bagPanel() {
    const y = you();
    const bag = y?.bag ?? [];
    const total = bag.reduce((s: number, b: any) => s + b.value, 0);
    return `<div class="actionbar">
      <div class="abhead"><b>🧺 BESACE</b><button class="close" id="closepanel">✕</button></div>
      ${bag.length ? `<div class="baglist">${bag.map((b: any) => {
        const f = fishAt(b.fishId)!;
        const vn = variantAt(b.variant).name;
        return `<div class="bagrow">
          <span class="bicon">${f.icon}</span>
          <span class="bname">${vn ? vn + ' ' : ''}${f.name}<small>${b.kg} kg</small></span>
          <span class="bval mono">${fmtShells(b.value)}</span>
        </div>`;
      }).join('')}</div>
      <div class="hintline">Total : ${fmtShells(total)} — à vendre au marché 🐟</div>`
      : '<div class="locked">Besace vide. Va pêcher.</div>'}
    </div>`;
  }

  function shopPanel() {
    const y = you();
    const shells = y?.shells ?? 0;
    const cur = rodAt(y?.rod ?? 'bambou');
    return `<div class="actionbar shoppanel">
      <div class="abhead"><b>🎣 ÉQUIPEMENT</b><button class="close" id="closepanel">✕</button></div>
      <div class="shoplist">
        ${RODS.map(r => {
          const has = cur.price >= r.price;
          const can = !has && shells >= r.price;
          return `<div class="sitem ${has ? 'has' : ''}">
            <div class="sic">${r.icon}</div>
            <div class="sinfo"><b>${r.name}</b><span>${r.desc}</span>
              <small class="mono">ligne ${r.lineMax} · portée ×${r.power}</small></div>
            <button class="sbuy" data-kind="rod" data-id="${r.id}" ${has || !can ? 'disabled' : ''}>
              ${has ? '✓' : fmtShells(r.price)}</button>
          </div>`;
        }).join('')}
        ${BAITS.map(b => {
          const has = y?.bait === b.id;
          return `<div class="sitem ${has ? 'has' : ''}">
            <div class="sic">${b.icon}</div>
            <div class="sinfo"><b>${b.name}</b><span>${b.desc}</span>
              <small class="mono">attrait ×${b.lure}</small></div>
            <button class="sbuy" data-kind="bait" data-id="${b.id}" ${has || shells < b.price ? 'disabled' : ''}>
              ${has ? '✓' : b.price ? fmtShells(b.price) : 'Gratuit'}</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function actionBar() {
    const y = you();
    const stage = y?.stage ?? 'IDLE';
    const bag = y?.bag ?? [];

    if (stage === 'SOAKED') {
      const left = Math.max(0, Math.ceil(((you()?.soakedUntil ?? 0) - Date.now()) / 1000));
      return `<div class="actionbar soaked">
        <div class="abhead"><b>💦 À L'EAU !</b></div>
        <div class="hintline big">Tu barbotes… on te repêche dans ${left} s.</div>
      </div>`;
    }
    if (stage === 'FIGHT') {
      const f = me()?.fish;
      return `<div class="actionbar fightbar">
        <div class="fighthead"><b>${f ? fishAt(f.id)?.icon + ' ' + fishAt(f.id)?.name : 'Ça tire !'}</b>
          ${f ? rarityChip(f.id) : ''}</div>
        <div class="gauge"><span class="glabel">Ligne</span><div class="gbar"><div class="tensfill" id="tens"></div></div></div>
        <div class="gauge"><span class="glabel">Ramené</span><div class="gbar"><div class="distfill" id="dist"></div></div></div>
        <button class="go reelbtn" id="reel">🌀 MAINTENIR POUR MOULINER</button>
        <div class="hintline">${crossedUntil > Date.now()
          ? '🪢 LIGNES EMMÊLÉES — mouliner coûte double, attendez !'
          : 'Relâche quand la ligne rougit — et recule si ça t’arrache.'}</div>
      </div>`;
    }
    if (stage === 'BITE') {
      return `<div class="actionbar"><button class="go bitebtn" id="hook">❗ FERRER !</button></div>`;
    }
    if (stage === 'CAST' || stage === 'WAIT') {
      return `<div class="actionbar">
        <div class="hintline big">${stage === 'CAST' ? 'La ligne part…' : '🎣 Attends la touche…'}</div>
        <button class="go ghost" id="hook">Ferrer</button>
      </div>`;
    }
    if (panel === 'SHOP') return shopPanel();
    if (panel === 'BAG') return bagPanel();
    if (nearMarket()) {
      const total = bag.reduce((s: number, b: any) => s + b.value, 0);
      return `<div class="actionbar">
        <div class="abhead"><b>🐟 MARCHÉ</b><small class="mdesc">${bag.length} prise${bag.length > 1 ? 's' : ''}</small></div>
        <button class="go" id="sell" ${bag.length ? '' : 'disabled'}>VENDRE · ${fmtShells(total)}</button>
      </div>`;
    }
    if (nearShop()) {
      return `<div class="actionbar">
        <div class="abhead"><b>🎣 ÉQUIPEMENT</b><small class="mdesc">${rodAt(you()?.rod ?? 'bambou').name}</small></div>
        <button class="go" id="openshop">VOIR LE MATÉRIEL</button>
      </div>`;
    }
    if (!atWater()) {
      return `<div class="hint">🕹️ Avance au bout du ponton pour lancer ta ligne</div>`;
    }
    if (bag.length >= 6) {
      return `<div class="actionbar"><div class="locked">🧺 Besace pleine — va vendre au marché.</div></div>`;
    }
    return `<div class="actionbar">
      <div class="castrow"><div class="castgauge"><div class="castfill" id="castbar"></div></div></div>
      <button class="go castbtn" id="cast">🎣 MAINTENIR POUR LANCER</button>
      <div class="hintline">Plus tu maintiens, plus tu vas loin — et plus c'est profond.</div>
    </div>`;
  }

  function render() {
    if (!S) return;
    if (S.phase === 'LOBBY') return;          // la coquille affiche le salon
    ctx.ui.innerHTML = `${topBar()}${sideList()}${actionBar()}`;
    bind();
  }

  function bind() {
    const q = $('#quit'); if (q) q.onclick = () => { if (confirm('Quitter la partie ?')) location.reload(); };
    const ob = $('#openbag'); if (ob) ob.onclick = () => { panel = panel === 'BAG' ? 'NONE' : 'BAG'; ctx.play('tap'); render(); };
    const cp = $('#closepanel'); if (cp) cp.onclick = () => { panel = 'NONE'; render(); };
    const os = $('#openshop'); if (os) os.onclick = () => { panel = 'SHOP'; ctx.play('tap'); render(); };
    const sl = $('#sell'); if (sl) sl.onclick = () => { ctx.send({ t: 'sell' }); safeAudio(); ctx.play('buy'); };
    ctx.ui.querySelectorAll('.sbuy').forEach(b => (b as HTMLElement).onclick = () => {
      const e = b as HTMLElement;
      ctx.play('tap');
      ctx.send({ t: 'shop', kind: e.dataset.kind, id: e.dataset.id });
    });
    const hk = $('#hook'); if (hk) hk.onclick = () => { ctx.send({ t: 'hook' }); safeAudio(); ctx.play('lever'); };

    const cast = $('#cast');
    if (cast) {
      // L'état AVANT le son : sur iOS comme dans un test, initAudio() peut lever et
      // le lancer ne partait jamais — le joueur appuie, rien ne se passe.
      const down = (e: Event) => {
        e.preventDefault();
        holding = true; holdStart = Date.now(); holdPower = 0;
        safeAudio();
      };
      const up = (e: Event) => {
        e.preventDefault();
        if (!holding) return;
        holding = false;
        holdPower = Math.min(1, (Date.now() - holdStart) / 1200);
        ctx.send({ t: 'cast', power: holdPower });
        ctx.play('lever');
      };
      cast.addEventListener('pointerdown', down);
      cast.addEventListener('pointerup', up);
      cast.addEventListener('pointercancel', up);
      cast.addEventListener('pointerleave', up);
    }
    const reel = $('#reel');
    if (reel) {
      const on = (e: Event) => { e.preventDefault(); reeling = true; ctx.send({ t: 'reel', on: true }); reel.classList.add('on'); };
      const off = (e: Event) => { e.preventDefault(); if (!reeling) return; reeling = false; ctx.send({ t: 'reel', on: false }); reel.classList.remove('on'); };
      reel.addEventListener('pointerdown', on);
      reel.addEventListener('pointerup', off);
      reel.addEventListener('pointercancel', off);
      reel.addEventListener('pointerleave', off);
    }
  }

  return {
    id: 'fish',
    onState(state: any, id: string) {
      const prevStage = you()?.stage;
      S = state; youId = id;
      setPlayers(state.players ?? [], id);
      const st = state.you?.stage;
      if (st !== prevStage) {
        if (st === 'IDLE') endLine(id);
        render();
      } else render();
    },
    onEv(m: any) {
      const mine = m.playerId === youId;
      switch (m.kind) {
        case 'cast':
          castTo(m.playerId, m.dist ?? .5);
          ctx.play('lever');
          break;
        case 'bite':
          if (mine) { ctx.vibrate(60); ctx.play('tickHot'); }
          else ctx.play('tick');
          break;
        case 'hooked': if (mine) { ctx.play('lever'); bump(.6); } break;
        case 'jump': {
          const b = bobberAt(m.playerId);
          if (b) { splash(b, true); floatText(b, '💦', '#bfe8ff'); }
          ctx.play('chest'); bump(.5);
          break;
        }
        case 'zap': if (mine) { ctx.vibrate(120); bump(1.1); } ctx.play('bust'); break;
        case 'snap': {
          const b = bobberAt(m.playerId);
          if (b) floatText(b, '💥 CASSÉ', '#ff8a8a');
          endLine(m.playerId);
          if (mine) { ctx.vibrate(200); bump(1.6); }
          ctx.play('bust');
          break;
        }
        case 'miss': case 'early': endLine(m.playerId); ctx.play('deny'); break;
        case 'catch': {
          const b = bobberAt(m.playerId) ?? new THREE.Vector3(0, 0, 0);
          const f = fishAt(m.fishId)!;
          const r = RARITY[f.rarity];
          splash(b, m.kg > 8);
          floatText(b, `${f.icon} ${m.kg} kg`, r.color);
          endLine(m.playerId);
          const big = f.rarity === 'EPIQUE' || f.rarity === 'LEGENDAIRE';
          ctx.play(big ? 'bigWin' : 'win');
          if (big) bump(1.8);
          if (mine && m.first) ctx.toast(`Nouvelle espèce : ${f.name} !`);
          break;
        }
        // --- le chaos ---
        case 'drag':
          forcePos(m.playerId, m.x, m.z);
          if (mine) { ctx.vibrate(50); bump(.9); ctx.play('tick'); }
          break;
        case 'overboard':
          forcePos(m.playerId, m.x, m.z, true);
          setSoaked(m.playerId, true);
          if (mine) { ctx.vibrate(300); bump(2.2); }
          ctx.play('fall');
          render();
          break;
        case 'climb':
          forcePos(m.playerId, m.x, m.z, false);
          setSoaked(m.playerId, false);
          ctx.play('ding');
          render();
          break;
        case 'wave':
          for (const [id, xz] of Object.entries(m.pos ?? {})) forcePos(id, (xz as any)[0], (xz as any)[1]);
          bump(1.4); ctx.play('bust');
          if (mine) ctx.vibrate(90);
          render();
          break;
        case 'cross':
          crossedUntil = Date.now() + (m.ms ?? 2600);
          if ((m.ids ?? []).includes(youId)) { ctx.vibrate(140); bump(1.1); }
          ctx.play('deny');
          break;
        case 'sell': ctx.play('coin'); break;
        case 'buy': ctx.play('buy'); break;
        case 'reject': ctx.toast(m.text); ctx.vibrate(40); break;
      }
      if (m.text && m.kind !== 'reject') ctx.toast(m.text);
    },
    /** Le combat arrive 10×/s : on ne re-rend pas, on met juste les jauges à jour. */
    onFight(f: Record<string, [number, number, number]>) {
      for (const [id, v] of Object.entries(f)) {
        setFight(id, v[0], v[1], v[2]);
        if (id === youId) { tension = v[0]; distance = v[1]; surge = v[2]; }
      }
    },
    input(x: number, z: number) { setMoveInput(x, z); },
    setRemote(id: string, x: number, z: number) { setRemotePos(id, x, z); },
    canWalk() {
      const st = you()?.stage;
      if (S?.phase !== 'PLAYING') return false;
      // Pendant un combat on peut RECULER — mais pas en moulinant. C'est tout le
      // dilemme : gagner de la ligne, ou sauver ses pieds.
      if (st === 'FIGHT') { setWalkScale(.5); return !reeling; }
      setWalkScale(1);
      return st === 'IDLE';
    },
    pos: getMyPos,
    render,
    destroy() {
      cancelAnimationFrame(frame);
      teardownFish();
      cv.remove();
    },
  };
}
