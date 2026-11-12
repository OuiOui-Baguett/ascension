// ============================================================
// Chargement des assets CC0 (Poly Haven) : modèles GLB compressés, textures PBR, HDRI.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = (import.meta.env.BASE_URL || '/') + 'res/';
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();
const hdrLoader = new RGBELoader();

const models = new Map<string, GLTF>();
const textures = new Map<string, THREE.Texture>();
let hdr: THREE.DataTexture | null = null;

export const MODEL_IDS = [
  'Chandelier_01', 'Chandelier_03', 'street_lamp_01', 'street_lamp_02', 'fire_hydrant', 'CashRegister_01',
  'ArmChair_01', 'Sofa_01', 'security_camera_01', 'metal_trash_can',
  'water_manhole_cover', 'covered_car', 'marble_bust_01', 'potted_plant_04', 'Ottoman_01',
];
// Personnages Microsoft Rocketbox (licence MIT) et leurs animations de capture de mouvement
export const CHAR_IDS = ['Business_Male_01', 'Business_Male_02', 'Business_Male_03', 'Business_Male_05', 'Business_Male_06',
  'Business_Female_01', 'Business_Female_02', 'Female_Party_02', 'Security_Male_01'];
export const ANIM_IDS = ['m_idle_neutral_01', 'm_idle_neutral_02', 'f_idle_neutral_01', 'm_sit_table_idle_neutral_01', 'm_sit_table_idle_neutral_02',
  'f_sit_table_idle_neutral_01', 'm_sit_chair_idle_neutral_01', 'f_sit_chair_idle_neutral_01', 'm_drink_idle', 'f_drink_drinking',
  'm_gestic_talk_neutral_01', 'f_gestic_talk_neutral_01', 'm_walk_neutral_01', 'f_walk_neutral_01', 'm_walk_stroll_01', 'm_run_slow_01', 'f_run_slow_01'];
export const TEX_IDS = ['asphalt_02', 'concrete_pavement', 'brick_wall_10', 'marble_01', 'dark_paneled_wood', 'velour_velvet', 'granite_tile'];

// Version publiée : l'hébergeur ne sert pas .glb/.hdr → livrés en JSON base64.
const PACKED = import.meta.env.VITE_SOLO === '1';
async function unpack(url: string): Promise<ArrayBuffer> {
  const b64: string = await (await fetch(url + '.json')).json();
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
const loadModel = (url: string): Promise<GLTF> => PACKED
  ? unpack(url).then(buf => gltfLoader.parseAsync(buf, url.slice(0, url.lastIndexOf('/') + 1)))
  : gltfLoader.loadAsync(url);
const loadHdr = (url: string): Promise<THREE.DataTexture> => PACKED
  ? unpack(url).then(buf => {
    const d: any = hdrLoader.parse(buf);
    const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
    t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.flipY = true; t.needsUpdate = true;
    return t;
  })
  : hdrLoader.loadAsync(url);

export function preload(progress: (p: number) => void, aniso: number): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  let done = 0;
  const tick = () => { done++; progress(done / jobs.length); };
  for (const id of MODEL_IDS) jobs.push(loadModel(BASE + `models/${id}.glb`).then(g => { models.set(id, g); tick(); }));
  for (const id of [...CHAR_IDS, ...ANIM_IDS]) jobs.push(loadModel(BASE + `chars/${id}.glb`).then(g => { models.set(id, g); tick(); }));
  for (const id of TEX_IDS) for (const k of ['diff', 'nor', 'arm']) {
    jobs.push(texLoader.loadAsync(BASE + `tex/${id}_${k}.webp`).then(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      if (k === 'diff') t.colorSpace = THREE.SRGBColorSpace;
      textures.set(`${id}_${k}`, t); tick();
    }));
  }
  jobs.push(loadHdr(BASE + 'env/night_1k.hdr').then(t => { hdr = t; tick(); }));
  return Promise.all(jobs).then(() => undefined);
}

export function getHDR() { return hdr; }
export function getGLTF(id: string) { return models.get(id) ?? null; }

/** Copie d'un modèle ; `only` garde les nœuds dont le nom commence par l'un des préfixes. */
export function model(id: string, o: { only?: string[]; skip?: string[] } = {}): THREE.Group {
  const g = models.get(id);
  const root = new THREE.Group();
  if (!g) return root;
  const c = g.scene.clone(true);
  c.traverse(n => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    if (o.only && !o.only.some(p => n.name === p)) { m.visible = false; return; }
    if (o.skip && o.skip.some(p => n.name.startsWith(p))) { m.visible = false; return; }
    m.castShadow = m.receiveShadow = true;
  });
  // retire réellement les nœuds masqués (sinon ils coûtent un appel de rendu)
  const dead: THREE.Object3D[] = [];
  c.traverse(n => { if ((n as THREE.Mesh).isMesh && !n.visible) dead.push(n); });
  for (const d of dead) d.removeFromParent();
  root.add(c);
  return root;
}

/** Remplace les matériaux d'un modèle selon leur nom (ex. verre → verre émissif). */
export function remapMaterials(o: THREE.Object3D, f: (m: THREE.MeshStandardMaterial) => THREE.Material | null) {
  const cache = new Map<THREE.Material, THREE.Material>();
  o.traverse(n => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    if (!cache.has(src)) cache.set(src, f(src) ?? src);
    m.material = cache.get(src)!;
  });
}

interface PbrOpts {
  repeat?: [number, number]; color?: string; roughness?: number; metalness?: number;
  normalScale?: number; envMapIntensity?: number;
}
const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Matériau PBR d'une texture Poly Haven (couleur + normale + ARM). Les UV sont en mètres / repeat. */
export function pbr(id: string, o: PbrOpts = {}): THREE.MeshStandardMaterial {
  const key = id + JSON.stringify(o);
  const hit = matCache.get(key);
  if (hit) return hit;
  const rep = o.repeat ?? [1, 1];
  const t = (k: string) => {
    const base = textures.get(`${id}_${k}`);
    if (!base) return null;
    const c = base.clone();
    c.repeat.set(rep[0], rep[1]);
    c.needsUpdate = true;
    return c;
  };
  const arm = t('arm');
  const m = new THREE.MeshStandardMaterial({
    map: t('diff'), normalMap: t('nor'), aoMap: arm, roughnessMap: arm, metalnessMap: arm,
    color: o.color ?? '#ffffff', roughness: o.roughness ?? 1, metalness: o.metalness ?? 1,
    normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    envMapIntensity: o.envMapIntensity ?? 1,
  });
  m.aoMapIntensity = .85;
  matCache.set(key, m);
  return m;
}

export function texRaw(id: string, k: 'diff' | 'nor' | 'arm') { return textures.get(`${id}_${k}`) ?? null; }
