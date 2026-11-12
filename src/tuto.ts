// ============================================================
// Le maître de jeu : explication des règles en 8 chapitres, voix ElevenLabs,
// plans de cinéma dans le casino et fiches illustrées qui accompagnent chaque idée.
// ============================================================
import type { Shot } from './world/world';
import type { Director } from './cam';
import { voice, stopNarration, audioReady, startAudio } from './audio';

interface Chapter { title: string; voice: string; text: string; card: string; shots: Shot[]; red?: boolean }

const ic = (d: string) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  crew: ic('<circle cx="16" cy="16" r="6"/><circle cx="32" cy="16" r="6"/><path d="M5 40c1-8 6-12 11-12s10 4 11 12M21 40c1-8 6-12 11-12s10 4 11 12"/>'),
  moon: ic('<path d="M32 6a18 18 0 1 0 10 28A15 15 0 0 1 32 6z"/>'),
  mask: ic('<path d="M6 18c6-4 30-4 36 0-1 10-6 15-11 15-3 0-5-3-7-3s-4 3-7 3c-5 0-10-5-11-15z"/><path d="M15 22h5M28 22h5"/>'),
  badge: ic('<rect x="10" y="6" width="28" height="36" rx="3"/><circle cx="24" cy="19" r="5"/><path d="M16 33c2-5 14-5 16 0M19 10h10"/>'),
  pick: ic('<circle cx="15" cy="33" r="7"/><path d="M20 28 40 8M34 14l4 4M30 18l3 3"/>'),
  smoke: ic('<path d="M10 34a7 7 0 0 1 2-13 9 9 0 0 1 17-3 7 7 0 0 1 9 9 6 6 0 0 1-2 11H14"/><path d="M18 42h14"/>'),
  pill: ic('<rect x="6" y="17" width="36" height="14" rx="7" transform="rotate(-30 24 24)"/><path d="m18 14 12 20"/>'),
  drill: ic('<path d="M6 16h22v12H6zM28 19h8l6 3-6 3h-8M12 28l-2 12h8l2-12"/>'),
  env: ic('<rect x="5" y="11" width="38" height="26" rx="2"/><path d="m5 13 19 14 19-14"/>'),
  eye: ic('<path d="M3 24s8-13 21-13 21 13 21 13-8 13-21 13S3 24 3 24z"/><circle cx="24" cy="24" r="6"/>'),
  cam: ic('<rect x="6" y="14" width="26" height="16" rx="2"/><path d="m32 19 10-5v16l-10-5M12 30l-3 10"/>'),
  run: ic('<circle cx="29" cy="8" r="4"/><path d="M14 22l7-8 8 4 5 7M21 14l-4 14 9 6v10M17 28l-9 6"/>'),
  bell: ic('<path d="M12 34V22a12 12 0 0 1 24 0v12l4 4H8z"/><path d="M20 42h8"/>'),
  van: ic('<path d="M4 14h26v20H4zM30 20h8l6 7v7H30"/><circle cx="12" cy="36" r="4"/><circle cx="36" cy="36" r="4"/>'),
  vote: ic('<rect x="8" y="22" width="32" height="18" rx="2"/><path d="M16 22l6-14 10 4-4 10M14 31h20"/>'),
};
const item = (icon: string, name: string, price: string, fx: string) =>
  `<div class="titem"><i>${icon}</i><div><b>${name}</b><span>${price}</span><p>${fx}</p></div></div>`;

export const CHAPTERS: Chapter[] = [
  { title: 'Le coup', voice: 'tuto_1',
    text: "Bienvenue, l'équipe. Ce soir, on braque le Grand Casino. Vous êtes entre trois et huit complices, chacun sur son téléphone. Le plan est simple : entrer comme de simples clients, préparer le coup pendant que le casino est ouvert, puis vider la chambre forte après la fermeture. Mais écoutez bien… parmi vous, il y a un traître.",
    card: `<h3>Le coup</h3><div class="tbig">
      <div><i>${ICON.crew}</i><b>3 à 8</b><span>complices</span></div>
      <div><i>${ICON.moon}</i><b>1 nuit</b><span>pour tout faire</span></div>
      <div class="red"><i>${ICON.mask}</i><b>1 traître</b><span>ou plus, choisi en secret</span></div></div>`,
    shots: [
      { from: [0, 2.2, 14], to: [0, 2.5, 9.5], look: [0, 2.4, 0], look2: [0, 2.7, -6], fov: 55, dur: 11 },
      { from: [3.8, 1.5, 4.6], to: [2.6, 1.7, 3.4], look: [0, 2.2, 0], look2: [0, 2.6, 0], fov: 46, dur: 11 },
    ] },
  { title: 'La nuit', voice: 'tuto_2',
    text: "Une nuit se joue en deux temps. D'abord le repérage, de vingt-trois heures quarante-sept à trois heures du matin : le casino est ouvert, et personne ne vous soupçonne. Vous jouez, vous achetez, vous écoutez les clients, vous repérez les lieux. À trois heures, le casino ferme. Le casse commence… et chaque minute fait monter la chaleur.",
    card: `<h3>Déroulé d'une nuit</h3><ol class="tline">
      <li><b>23 h 47</b><em>Repérage</em><span>Casino ouvert : personne n'est suspect. On joue, on achète, on repère.</span></li>
      <li><b>3 h 00</b><em>Le casse</em><span>Fermeture. Chaque minute fait monter la chaleur.</span></li>
      <li><b>4 h 00</b><em>La fuite</em><span>La camionnette part, avec ou sans vous.</span></li></ol>`,
    shots: [
      { from: [-4.6, 1.6, 9.5], to: [-4.2, 1.8, 4.5], look: [0, 2.6, 0], look2: [0, 2.4, -2], fov: 50, dur: 11 },
      { from: [0, 2, -1.5], to: [0, 1.85, -6], look: [0, 1.7, -14], look2: [0, 1.7, -14], fov: 48, dur: 11 },
    ] },
  { title: "L'argent et la caisse", voice: 'tuto_3',
    text: "Chacun entre avec cinq cents euros. C'est peu. Tout ce qui sert au casse s'achète ici, à la caisse, et nulle part ailleurs : le détecteur de métaux de l'entrée a gardé vos outils. Les stocks sont limités chaque nuit. Alors répartissez-vous les achats… et passez-vous de l'argent quand il le faut.",
    card: `<h3>L'argent</h3><div class="tchip">500 €<small>chacun au départ</small></div>
      <ul class="tlist"><li><b>La caisse</b> est le seul magasin, au fond de la galerie, à la vue de tous.</li>
      <li><b>Stocks limités</b> chaque nuit : répartissez-vous les achats.</li>
      <li><b>Donner</b> : approche-toi d'un complice pour lui passer de l'argent.</li></ul>`,
    shots: [
      { from: [-2.4, 1.7, -8], to: [1.9, 1.6, -8.6], look: [0, 1.5, -13], look2: [0, 1.55, -13], fov: 48, dur: 12 },
      { from: [0.6, 1.45, -10.2], to: [0, 1.5, -10.9], look: [0, 1.5, -13.2], look2: [0, 1.55, -13.2], fov: 40, dur: 10 },
    ] },
  { title: 'Les jeux', voice: 'tuto_4',
    text: "Pour payer vos outils, jouez. À la roulette, misez sur une couleur, une douzaine ou un numéro, et regardez la bille tomber. Aux machines à sous, trois rouleaux, et un jackpot commun qui grossit à chaque mise. Mais n'oubliez pas : à la longue, la banque gagne toujours. Celui qui mise gros peut tout rafler… ou tout perdre.",
    card: `<h3>Les jeux</h3><table class="ttab">
      <tr><th colspan="2">Roulette</th></tr><tr><td>Un numéro</td><td>×36</td></tr><tr><td>Une douzaine</td><td>×3</td></tr><tr><td>Rouge, noir, pair, impair…</td><td>×2</td></tr>
      <tr><th colspan="2">Machines à sous</th></tr><tr><td>Jackpot commun, entier à 100 € de mise</td><td>♦♦♦</td></tr></table>
      <p class="tnote">À la longue, la banque gagne toujours.</p>`,
    shots: [
      { from: [-9.2, 1.9, -6.4], to: [-10.8, 1.75, -6.9], look: [-10.4, .9, -9.6], look2: [-10.4, .9, -9.6], fov: 46, dur: 11 },
      { from: [7.3, 1.6, -2], to: [7.5, 1.5, -4.6], look: [9, 1.4, -7], look2: [9, 1.45, -8], fov: 48, dur: 11 },
    ] },
  { title: 'Les outils', voice: 'tuto_5',
    text: "Quelques outils à connaître. Le faux badge ouvre les portes du personnel. Le kit de crochetage force les serrures, les casiers et les tiroirs. Le fumigène coupe toutes les lignes de vue pendant quinze secondes. Le somnifère endort un vigile. Et la perceuse thermique ouvre la chambre forte en une minute et demie… mais on l'entend dans tout le bâtiment.",
    card: `<h3>Les outils clés</h3><div class="titems">
      ${item(ICON.badge, 'Faux badge', '≈ 400 €', 'Ouvre les portes du personnel, 3 fois.')}
      ${item(ICON.pick, 'Kit de crochetage', '≈ 300 €', 'Serrures, casiers, tiroirs.')}
      ${item(ICON.smoke, 'Fumigène', '≈ 250 €', '15 s sans aucune ligne de vue.')}
      ${item(ICON.pill, 'Somnifère', '≈ 350 €', 'Endort un vigile 2 minutes.')}
      ${item(ICON.drill, 'Perceuse thermique', '≈ 2 000 €', 'Chambre forte en 90 s. Très bruyante.')}</div>`,
    shots: [
      { from: [8, 1.6, -28.2], to: [1.5, 1.6, -28.2], look: [-10, 1.4, -28.4], look2: [-14, 1.4, -28.4], fov: 52, dur: 11 },
      { from: [11, 1.6, -16.4], to: [11, 1.6, -20.5], look: [11, 1.3, -27.5], look2: [11, 1.3, -27.5], fov: 50, dur: 11 },
    ] },
  { title: "L'indic", voice: 'tuto_6', red: true,
    text: "Parlons du traître. Au début de la nuit, chacun découvre son rôle en secret. Le ou les indics jouent comme vous, mais ils renseignent la police. À la caisse, ils ont un menu piégé : un tuyau aux flics, un vigile prévenu, un faux code. L'effet est immédiat… et la caissière leur tend une enveloppe rouge. Si vous la voyez, vous tenez une preuve.",
    card: `<h3>L'indic</h3><div class="tenv"><i>${ICON.env}</i><span>Enveloppe rouge = achat piégé</span></div>
      <ul class="tlist"><li><b>Rôle secret</b> : personne ne sait qui c'est.</li>
      <li><b>Menu piégé</b> : tuyau aux flics, vigile prévenu, faux code… effet immédiat.</li>
      <li><b>Témoin = preuve</b> : si tu le vois recevoir l'enveloppe, ton téléphone le note.</li></ul>`,
    shots: [
      { from: [0, 1.2, -8.6], to: [0, 1.35, -10.5], look: [0, 1.6, -13.2], look2: [0, 1.62, -13.2], fov: 38, dur: 12 },
      { from: [-3, 1.3, -5.5], to: [-1.2, 1.6, -8.6], look: [0, 1.8, -14], look2: [0, 2, -15], fov: 40, dur: 11 },
    ] },
  { title: 'Vigiles, caméras, chaleur', voice: 'tuto_7',
    text: "Dans les zones privées, les vigiles patrouillent et les caméras filment. Chaque erreur fait monter la chaleur : se faire voir, courir, déclencher une alarme. Si la jauge atteint cent pour cent, c'est la descente de police. Et tous ceux qui sont encore à l'intérieur finissent au poste.",
    card: `<h3>La chaleur</h3><div class="theat"><i></i><b>100 %</b></div>
      <div class="tcause"><span>${ICON.eye}Vu par un vigile</span><span>${ICON.cam}Filmé</span><span>${ICON.run}Courir</span><span>${ICON.bell}Alarme</span></div>
      <p class="tnote">À 100 % : descente de police, tout le monde est arrêté.</p>`,
    shots: [
      { from: [14.6, 1.55, -19.6], to: [16.8, 1.45, -21.2], look: [20, 1.9, -21.5], look2: [20, 1.9, -21.5], fov: 44, dur: 11 },
      { from: [-22.5, 1.7, -10], to: [-22.5, 1.6, -18], look: [-22.5, 1.4, -28], look2: [-22.5, 1.4, -28], fov: 50, dur: 10 },
    ] },
  { title: 'Démasquer et gagner', voice: 'tuto_8',
    text: "Un doute ? Appelez une réunion de crise, et votez. Le joueur écarté révèle aussitôt son camp. Écartez l'indic, et la chaleur retombe. Écartez un innocent, et c'est le traître qui prend l'avantage. Pour gagner, l'équipe doit ramener assez de butin à la camionnette avant quatre heures. Bonne chance… et ne faites confiance à personne.",
    card: `<h3>Qui gagne ?</h3><div class="tvote"><i>${ICON.vote}</i><span>Réunion de crise → vote → le camp de l'écarté est révélé</span></div>
      <div class="twin"><div><i>${ICON.van}</i><b>L'équipe</b><span>ramène assez de butin à la camionnette avant 4 h.</span></div>
      <div class="red"><i>${ICON.mask}</i><b>L'indic</b><span>gagne si la police débarque ou si la fuite rate.</span></div></div>`,
    shots: [
      { from: [8.2, 1.5, -21], to: [3.4, 1.45, -21.2], look: [0, 1, -21.4], look2: [-1.4, .9, -21.6], fov: 46, dur: 11 },
      { from: [0, 3.2, 12], to: [0, 4.2, 6], look: [0, 1.5, -6], look2: [0, 1.2, -12], fov: 56, dur: 12 },
    ] },
];

const $ = (s: string) => document.querySelector(s) as HTMLElement;

export class Tuto {
  on = false;
  private i = 0; private timers: number[] = []; private token = 0;
  constructor(private director: Director, private onEnd: () => void) {
    $('#t-next').onclick = () => this.go(this.i + 1);
    $('#t-skip').onclick = () => this.stop(true);
    $('#t-dots').innerHTML = CHAPTERS.map((_, k) => `<i data-k="${k}"></i>`).join('');
    $('#t-dots').onclick = e => { const k = (e.target as HTMLElement).dataset.k; if (k) this.go(+k); };
    // lancé sans toucher l'écran (première visite) : le navigateur bloque le son tant qu'on n'a pas touché
    $('#t-sound').onclick = () => { startAudio(); $('#t-sound').classList.add('hidden'); setTimeout(() => this.go(this.i), 120); };
  }
  start() { this.on = true; $('#tuto').classList.remove('hidden'); this.go(0); }
  stop(done = false) {
    if (!this.on) return;
    this.on = false; this.clear(); stopNarration();
    $('#tuto').classList.add('hidden'); $('#t-sub').textContent = ''; $('#t-sound').classList.add('hidden');
    try { localStorage.setItem('casse.tuto', '1'); } catch { /* stockage indisponible */ }
    if (done) this.onEnd();
  }
  private clear() { this.timers.forEach(clearTimeout); this.timers = []; this.token++; }
  private async go(i: number) {
    if (!this.on) return;
    if (i >= CHAPTERS.length) { this.stop(true); return; }
    this.clear(); const tk = this.token;
    this.i = i;
    const ch = CHAPTERS[i];
    document.querySelectorAll('#t-dots i').forEach((d, k) => { d.classList.toggle('on', k === i); d.classList.toggle('done', k < i); });
    $('#t-title').textContent = ch.title;
    $('#t-num').textContent = `${i + 1} / ${CHAPTERS.length}`;
    $('#t-next').innerHTML = i === CHAPTERS.length - 1 ? 'Terminer ✓' : 'Suivant ▸';
    const card = $('#t-card');
    card.classList.remove('in'); void card.offsetWidth;
    card.innerHTML = ch.card; card.classList.add('in');
    $('#tuto').classList.toggle('red', !!ch.red);
    this.director.play(ch.shots, true);
    $('#t-sound').classList.toggle('hidden', audioReady());
    // la voix ; sans fichier, on garde un temps de lecture confortable
    const d = await voice(ch.voice, { narration: true });
    if (tk !== this.token) return;
    const total = d > 0 ? d : ch.text.length / 15;
    // sous-titres phrase par phrase, calés sur la durée de la voix
    const parts = ch.text.match(/[^.!?…:]+[.!?…:]*\s*/g) ?? [ch.text];
    const L = parts.reduce((a, p) => a + p.length, 0);
    let t = 0;
    for (const p of parts) {
      const at = t; this.timers.push(window.setTimeout(() => { $('#t-sub').textContent = p.trim(); }, at * 1000));
      t += total * p.length / L;
    }
    this.timers.push(window.setTimeout(() => this.go(i + 1), (total + 1.4) * 1000));
  }
}
