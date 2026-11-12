// Télécharge les assets CC0 Poly Haven du Casse dans /home/claude/raw-casse
import fs from 'node:fs';
import path from 'node:path';
const RAW = '/home/claude/raw-casse';
const TEX = ['asphalt_02', 'concrete_pavement', 'large_sandstone_blocks_01', 'brick_wall_10', 'marble_01',
  'dark_paneled_wood', 'velour_velvet', 'leather_red_02', 'granite_tile'];
const MODELS = ['Chandelier_01', 'Chandelier_02', 'Chandelier_03', 'street_lamp_01', 'street_lamp_02', 'fire_hydrant',
  'CashRegister_01', 'ArmChair_01', 'Sofa_01', 'bar_chair_round_01', 'wine_bottles_01', 'security_camera_01',
  'metal_trash_can', 'water_manhole_cover', 'covered_car', 'marble_bust_01', 'potted_plant_04', 'Ottoman_01'];
const HDRI = ['cobblestone_street_night'];
async function get(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let k = 0; k < 3; k++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status + ' ' + url);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return; } catch (e) { if (k === 2) throw e; }
  }
}
const api = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
const jobs = [];
for (const id of TEX) jobs.push((async () => {
  const d = await api(id);
  for (const [map, key] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['arm', 'arm']]) {
    const m = d[map] ?? (map === 'arm' ? d['AO'] : null);
    if (!m) { console.log('manque', id, map, Object.keys(d)); continue; }
    await get(m['1k']['jpg'].url, `${RAW}/tex/${id}/${key}.jpg`);
  }
  console.log('tex', id);
})());
for (const id of MODELS) jobs.push((async () => {
  const d = await api(id);
  const g = d.gltf['1k'].gltf;
  await get(g.url, `${RAW}/models/${id}/${id}.gltf`);
  for (const [rel, inc] of Object.entries(g.include)) await get(inc.url, `${RAW}/models/${id}/${rel}`);
  console.log('model', id);
})());
for (const id of HDRI) jobs.push((async () => {
  const d = await api(id);
  await get(d.hdri['1k'].hdr.url, `${RAW}/hdri/${id}_1k.hdr`);
  console.log('hdri', id);
})());
const r = await Promise.allSettled(jobs);
for (const x of r) if (x.status === 'rejected') console.log('ERR', x.reason?.message);
