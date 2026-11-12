// ============================================================
// Lumières par zone : un nombre FIXE de lampes réelles (le shader ne se recompile
// jamais), réaffectées selon la pièce où se trouve la caméra. Les autres pièces
// gardent leurs lampes émissives, leurs halos et leur sonde d'environnement.
// ============================================================
import * as THREE from 'three';
import type { V3 } from '../world/world';

export interface LightDef {
  kind: 'point' | 'spot'; pos: V3; color: string; intensity: number; distance: number; decay?: number;
  angle?: number; penumbra?: number; target?: V3; flicker?: number;
}
export interface Zone {
  name: string; rects: [number, number, number, number][]; lights: LightDef[];
  env?: THREE.Texture; envIntensity?: number;
}

export class LightPool {
  points: THREE.PointLight[] = []; spots: THREE.SpotLight[] = [];
  private defs: { l: THREE.PointLight | THREE.SpotLight; d: LightDef | null }[] = [];
  constructor(parent: THREE.Object3D, nPoints: number, nSpots: number) {
    for (let i = 0; i < nPoints; i++) { const l = new THREE.PointLight('#fff', 0, 10, 1.5); l.position.set(0, -50, 0); parent.add(l); this.points.push(l); }
    for (let i = 0; i < nSpots; i++) { const l = new THREE.SpotLight('#fff', 0, 10, .5, .5, 1.5); l.position.set(0, -50, 0); parent.add(l, l.target); this.spots.push(l); }
  }
  apply(defs: LightDef[]) {
    let p = 0, s = 0;
    this.defs = [];
    for (const d of defs) {
      const l = d.kind === 'point' ? this.points[p++] : this.spots[s++];
      if (!l) continue;
      l.color.set(d.color); l.intensity = d.intensity; l.distance = d.distance; l.decay = d.decay ?? 1.5;
      l.position.set(...d.pos);
      if ((l as THREE.SpotLight).isSpotLight) {
        const sl = l as THREE.SpotLight;
        sl.angle = d.angle ?? .5; sl.penumbra = d.penumbra ?? .5;
        sl.target.position.set(...(d.target ?? [d.pos[0], 0, d.pos[2]])); sl.target.updateMatrixWorld();
      }
      this.defs.push({ l, d });
    }
    for (; p < this.points.length; p++) this.points[p].intensity = 0;
    for (; s < this.spots.length; s++) this.spots[s].intensity = 0;
  }
  /** Scintillement léger des flammes et des lustres. */
  tick(t: number) {
    this.defs.forEach(({ l, d }, i) => {
      if (d?.flicker) l.intensity = d.intensity * (1 + (Math.sin(t * 9.1 + i * 2.3) * Math.sin(t * 5.3 + i) + Math.sin(t * 23 + i) * .3) * d.flicker);
    });
  }
}

export function zoneAt(zones: Zone[], x: number, z: number): Zone | null {
  for (const zn of zones) for (const r of zn.rects) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return zn;
  return null;
}
