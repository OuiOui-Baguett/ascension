// ============================================================
// Avatars animés : un petit robot riggé (CC0), teint à la couleur du joueur,
// chapeau vissé sur l'os de la tête, marche/course/émotes mélangées en douceur.
// ============================================================
import * as THREE from 'three';
import { cloneModel, gltf, hasModel } from './assets';

const HEIGHT = 1.45;
const EMOTE_CLIPS = ['ThumbsUp', 'Jump', 'Dance', 'Yes', 'Punch', 'No', 'Wave', 'Wave'];

export interface RigAvatar {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  current: string;
  headBone: THREE.Object3D | null;
  emoteUntil: number;
}

export function robotReady() { return hasModel('robot'); }

export function makeRobot(color: string): RigAvatar | null {
  if (!hasModel('robot')) return null;
  const model = cloneModel('robot');
  // le modèle d'origine mesure ~4,5 unités (armature à l'échelle 100) : on le ramène à HEIGHT
  model.scale.setScalar(HEIGHT / 4.5);
  model.rotation.y = Math.PI;           // le modèle regarde +Z ; nos avatars regardent -Z au repos
  let headBone: THREE.Object3D | null = null;
  model.traverse(o => {
    const m = o as THREE.SkinnedMesh;
    if ((o as any).isBone && o.name === 'Head') headBone = o;
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.name === 'Main') {
      const c = new THREE.MeshPhysicalMaterial({
        color, roughness: .32, metalness: .15, clearcoat: .8, clearcoatRoughness: .25,
      });
      m.material = c;
    } else if (mat.name === 'Grey') {
      m.material = new THREE.MeshStandardMaterial({ color: '#2b2832', roughness: .4, metalness: .6 });
    } else if (mat.name === 'Black') {
      m.material = new THREE.MeshStandardMaterial({ color: '#08070b', roughness: .25, metalness: .2, emissive: '#000' });
    }
  });
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const clip of gltf('robot').animations) {
    const a = mixer.clipAction(clip);
    if (['ThumbsUp', 'Jump', 'Yes', 'No', 'Wave', 'Punch', 'Dance'].includes(clip.name)) {
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false;
    }
    actions[clip.name] = a;
  }
  actions.Idle?.play();
  return { root, model, mixer, actions, current: 'Idle', headBone, emoteUntil: 0 };
}

function fadeTo(r: RigAvatar, name: string, dur = .22) {
  if (r.current === name || !r.actions[name]) return;
  const prev = r.actions[r.current], next = r.actions[name];
  next.reset().setEffectiveWeight(1).fadeIn(dur).play();
  prev?.fadeOut(dur);
  r.current = name;
}

/** Locomotion : `speed` 0..1 (0 = immobile). Les émotes gardent la priorité jusqu'à leur fin. */
export function updateRobot(r: RigAvatar, dt: number, speed: number, now: number) {
  if (now < r.emoteUntil) { r.mixer.update(dt); return; }
  const want = speed > .62 ? 'Running' : speed > .08 ? 'Walking' : 'Idle';
  fadeTo(r, want);
  if (want !== 'Idle') r.actions[want].timeScale = want === 'Running' ? .9 + speed * .3 : .8 + speed;
  r.mixer.update(dt);
}

export function emoteRobot(r: RigAvatar, index: number, now: number) {
  const name = EMOTE_CLIPS[index] ?? 'Wave';
  const a = r.actions[name];
  if (!a) return;
  fadeTo(r, name, .15);
  r.emoteUntil = now + a.getClip().duration * 1000 * .95;
}

/** Fixe un chapeau sur la tête (en tenant compte de l'échelle du modèle). */
export function attachHat(r: RigAvatar, hat: THREE.Object3D | null) {
  if (!hat || !r.headBone) return;
  const ws = new THREE.Vector3();
  r.headBone.getWorldScale(ws);
  hat.scale.multiplyScalar(1 / (ws.x || 1) * .9);
  hat.position.set(0, 1.25 / (ws.y || 1) * .32, 0);
  r.headBone.add(hat);
}
