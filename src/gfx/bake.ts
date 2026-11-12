// ============================================================
// Cuisson du statique : fusionne toutes les pièces immobiles d'un décor qui
// partagent la même matière en un seul maillage. Un temple de 600 pierres
// devient une poignée d'appels de dessin — indispensable sur téléphone.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const KEEP_ATTRS = ['position', 'normal', 'uv'];

export function bakeStatic(root: THREE.Object3D, dynamic: (THREE.Object3D | null | undefined)[] = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const dyn = new Set<THREE.Object3D>();
  for (const d of dynamic) d?.traverse(o => dyn.add(o));
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; shadow: boolean; meshes: THREE.Mesh[] }>();
  const rel = new THREE.Matrix4();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || dyn.has(m) || (m as any).isInstancedMesh || (m as any).isSkinnedMesh || (m as any).isPoints) return;
    if (Array.isArray(m.material) || m.material.transparent || m.userData.keep || !m.visible) return;
    if (m.morphTargetInfluences || m.children.length) return;
    const key = m.material.uuid + (m.userData.noShadow ? ':n' : ':s');
    let gr = groups.get(key);
    if (!gr) { gr = { mat: m.material, geos: [], shadow: !m.userData.noShadow, meshes: [] }; groups.set(key, gr); }
    rel.multiplyMatrices(inv, m.matrixWorld);
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!KEEP_ATTRS.includes(k)) g.deleteAttribute(k);
    // les modèles compressés (quantifiés) stockent en entiers : tout repasse en flottants
    for (const k of Object.keys(g.attributes)) {
      const a = g.attributes[k] as THREE.BufferAttribute;
      if (a.array instanceof Float32Array && !a.normalized && !(a as any).isInterleavedBufferAttribute) continue;
      const n = a.count, sz = a.itemSize, out = new Float32Array(n * sz);
      for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) out[i * sz + c] = a.getComponent(i, c);
      g.setAttribute(k, new THREE.BufferAttribute(out, sz));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(rel);
    // une échelle négative retourne les faces : on remet l'ordre des sommets d'aplomb
    if (rel.determinant() < 0) {
      const p = g.attributes.position.array as Float32Array, n = g.attributes.normal.array as Float32Array, u = g.attributes.uv.array as Float32Array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const a = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = a; const b = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = b; }
      for (let i = 0; i < u.length; i += 6) for (let k = 0; k < 2; k++) { const a = u[i + 2 + k]; u[i + 2 + k] = u[i + 4 + k]; u[i + 4 + k] = a; }
    }
    gr.geos.push(g); gr.meshes.push(m);
  });
  let before = 0, after = 0;
  for (const gr of groups.values()) {
    before += gr.meshes.length;
    if (gr.meshes.length < 2) { after += gr.meshes.length; continue; }
    const merged = mergeGeometries(gr.geos);
    if (!merged) { after += gr.meshes.length; continue; }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, gr.mat);
    mesh.castShadow = gr.shadow; mesh.receiveShadow = true;
    mesh.userData.noShadow = !gr.shadow;
    mesh.userData.baked = true;
    root.add(mesh);
    for (const m of gr.meshes) m.parent?.remove(m);
    after++;
  }
  return { before, after };
}
