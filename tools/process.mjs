// Optimise les assets bruts du Casse pour le mobile : simplification, WebP, meshopt.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
const RAW = '/home/claude/raw-casse';
const OUT = process.argv[2];
for (const d of ['models', 'tex', 'env']) fs.mkdirSync(`${OUT}/${d}`, { recursive: true });
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
// [id, ratio, taille textures]
const MODELS = [
  ['Chandelier_01', .45, 512], ['Chandelier_03', .4, 512], ['street_lamp_01', .3, 512], ['street_lamp_02', .4, 512],
  ['fire_hydrant', .08, 512], ['CashRegister_01', .6, 512], ['ArmChair_01', 1, 512], ['Sofa_01', 1, 512],
  ['bar_chair_round_01', .35, 512], ['wine_bottles_01', .25, 512], ['security_camera_01', .3, 256],
  ['metal_trash_can', .3, 512], ['water_manhole_cover', .5, 512], ['covered_car', .6, 1024],
  ['marble_bust_01', .35, 512], ['potted_plant_04', .7, 512], ['Ottoman_01', 1, 512],
];
for (const [id, ratio, size] of MODELS) {
  const doc = await io.read(`${RAW}/models/${id}/${id}.gltf`);
  const tf = [dedup(), prune(), weld()];
  if (ratio < 1) tf.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.003 }));
  tf.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }));
  tf.push(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...tf);
  await io.write(`${OUT}/models/${id}.glb`, doc);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  console.log(id.padEnd(22), Math.round(tris), 'tris', (fs.statSync(`${OUT}/models/${id}.glb`).size / 1024).toFixed(0), 'Ko',
    doc.getRoot().listNodes().map(n => n.getName()).slice(0, 8).join(','));
}
for (const id of ['asphalt_02', 'concrete_pavement', 'brick_wall_10', 'marble_01', 'dark_paneled_wood', 'velour_velvet', 'granite_tile']) {
  const src = `${RAW}/tex/${id}`;
  await sharp(`${src}/diff.jpg`).resize(1024, 1024).webp({ quality: 82 }).toFile(`${OUT}/tex/${id}_diff.webp`);
  await sharp(`${src}/nor.jpg`).resize(1024, 1024).webp({ quality: 88 }).toFile(`${OUT}/tex/${id}_nor.webp`);
  await sharp(`${src}/arm.jpg`).resize(512, 512).webp({ quality: 85 }).toFile(`${OUT}/tex/${id}_arm.webp`);
}
fs.copyFileSync(`${RAW}/hdri/cobblestone_street_night_1k.hdr`, `${OUT}/env/night_1k.hdr`);
console.log('total', fs.readdirSync(`${OUT}/models`).length, 'modèles');
