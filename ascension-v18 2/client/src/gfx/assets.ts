// ============================================================
// Chargement des assets (modèles GLB compressés, textures PBR, HDRI).
// Tout est mis en cache : un étage revisité ne retélécharge rien.
// ============================================================
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = (import.meta.env.BASE_URL || '/') + 'res/';
const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader(manager);
const hdrLoader = new RGBELoader(manager);

const models = new Map<string, GLTF>();
const textures = new Map<string, THREE.Texture>();
let hdr: THREE.DataTexture | null = null;
let maxAniso = 8;

export function setAnisotropy(n: number) { maxAniso = Math.min(8, n); }

export const MODEL_IDS = [
  'fern_02', 'calathea_orbifolia_01', 'anthurium_botany_01', 'potted_plant_02', 'shrub_03',
  'rock_moss_set_01', 'tree_stump_01', 'root_cluster_01', 'wooden_lantern_01', 'treasure_chest',
  'wooden_crate_02', 'bananas', 'brass_vase_01', 'stone_fire_pit', 'robot',
];
export const TEX_IDS = [
  'monastery_stone_floor', 'mossy_sandstone', 'rabdentse_ruins_wall', 'forest_leaves_02',
  'worn_planks', 'palm_bark', 'bamboo_wall', 'rock_pitted_mossy', 'weathered_planks',
];

// Version autonome publiée : certains hébergeurs ne servent pas .glb/.hdr ; ces fichiers y sont
// livrés en JSON (base64). Même contenu, une couche d'emballage en plus.
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

/** Précharge tout l'étage 1 ; `progress` reçoit 0..1. */
export function preloadJungle(progress: (p: number) => void): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  let done = 0;
  const tick = () => { done++; progress(done / total); };
  for (const id of MODEL_IDS) jobs.push(loadModel(BASE + `models/${id}.glb`).then(g => { models.set(id, g); tick(); }));
  for (const id of TEX_IDS) for (const k of ['diff', 'nor', 'arm']) {
    jobs.push(texLoader.loadAsync(BASE + `tex/${id}_${k}.webp`).then(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
      if (k === 'diff') t.colorSpace = THREE.SRGBColorSpace;
      textures.set(`${id}_${k}`, t); tick();
    }));
  }
  jobs.push(loadHdr(BASE + 'env/rainforest_1k.hdr').then(t => { hdr = t; tick(); }));
  const total = jobs.length;
  return Promise.all(jobs).then(() => undefined);
}

export function getHDR() { return hdr; }
export function hasModel(id: string) { return models.has(id); }
export function gltf(id: string) { return models.get(id)!; }

/** Copie indépendante d'un modèle (squelette compris pour les personnages). */
export function cloneModel(id: string): THREE.Object3D {
  const g = models.get(id);
  if (!g) return new THREE.Group();
  return SkeletonUtils.clone(g.scene);
}

/** Un sous-objet nommé d'un pack (ex. une des 4 fougères), recentré à l'origine. */
export function part(id: string, name: string): THREE.Mesh | null {
  const g = models.get(id);
  if (!g) return null;
  let found: THREE.Mesh | null = null;
  g.scene.traverse(o => { if (!found && (o as THREE.Mesh).isMesh && o.name.startsWith(name)) found = o as THREE.Mesh; });
  if (!found) return null;
  const m = (found as THREE.Mesh).clone();
  m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
  return m;
}

/** Toutes les variantes d'un pack, recentrées. */
export function parts(id: string): THREE.Mesh[] {
  const g = models.get(id);
  if (!g) return [];
  const out: THREE.Mesh[] = [];
  g.scene.traverse(o => {
    if ((o as THREE.Mesh).isMesh) {
      const m = (o as THREE.Mesh).clone();
      m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
      out.push(m);
    }
  });
  return out;
}

interface PbrOpts {
  repeat?: [number, number];
  color?: string;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  emissive?: string;
  emissiveIntensity?: number;
  side?: THREE.Side;
}
const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Matériau PBR complet (couleur + normale + AO/rugosité/métal) d'une texture Poly Haven. */
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
    map: t('diff'), normalMap: t('nor'),
    aoMap: arm, roughnessMap: arm, metalnessMap: arm,
    color: o.color ?? '#ffffff',
    roughness: o.roughness ?? 1, metalness: o.metalness ?? 1,
    normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    emissive: o.emissive ?? '#000000', emissiveIntensity: o.emissiveIntensity ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  // l'AO des textures Poly Haven est dans le canal R de l'ARM ; elle utilise uv1 → on la recopie
  m.aoMapIntensity = .9;
  matCache.set(key, m);
  return m;
}

/** Les textures brutes, pour les shaders maison (sol mélangé). */
export function texRaw(id: string, k: 'diff' | 'nor' | 'arm') { return textures.get(`${id}_${k}`) ?? null; }

/** L'aoMap lit le 2e jeu d'UV : on le crée à l'identique sur les géométries procédurales. */
export function withAoUv<T extends THREE.BufferGeometry>(g: T): T {
  if (!g.attributes.uv1 && g.attributes.uv) g.setAttribute('uv1', g.attributes.uv);
  return g;
}
