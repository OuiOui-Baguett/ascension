import type * as THREE from 'three';
import type { Look } from '../gfx/engine';
import type { Mirror } from '../gfx/mirror';

export type V3 = [number, number, number];
/** Un plan de caméra : travelling de `from` à `to`, regard de `look` à `look2`. */
export interface Shot { from: V3; to: V3; look: V3; look2: V3; fov: number; dur: number; focus?: number; text?: string }

export interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hooks: ((r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera) => void)[];
  look: Look;
  shots: Shot[];
  enter?: V3[];
  focus: number;
  tick: (t: number, dt: number) => void;
  mirror: Mirror;
  spawn?: { pos: V3; yaw: number };
  /** Obstacles au sol pour la marche libre : [x0, z0, x1, z1] */
  solids?: [number, number, number, number][];
  bounds?: [number, number, number, number];
}
