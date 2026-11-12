// Avatars Microsoft Rocketbox (MIT) : FBX → glTF (FBX2glTF) → textures PNG réinjectées → GLB optimisé.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const RB = '/home/claude/rb', OUT = process.argv[2];
const BIN = '/home/claude/tools/node_modules/fbx2gltf/bin/Linux/FBX2glTF';
fs.mkdirSync(`${OUT}/chars`, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const AV = ['Business_Male_01', 'Business_Male_02', 'Business_Male_03', 'Business_Male_05', 'Business_Male_06', 'Business_Female_01', 'Business_Female_02', 'Female_Party_02', 'Security_Male_01'];
for (const name of AV) {
  const dir = `${RB}/src/${name}`;
  execFileSync(BIN, ['-i', `${dir}/${name}.fbx`, '-o', `${RB}/out/${name}`], { stdio: 'pipe' });
  const doc = await io.read(`${RB}/out/${name}_out/${name}.gltf`);
  const root = doc.getRoot();
  const pngs = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  const tex = (part, kind) => {
    const f = pngs.find(p => p.includes(`_${part}_${kind}`) || (part === 'opacity' && p.endsWith('opacity_color.png') && !p.includes('glasses')) || (part === 'glasses' && p.includes('glasses_opacity')));
    if (!f) return null;
    return doc.createTexture(f).setImage(fs.readFileSync(`${dir}/${f}`)).setMimeType('image/png');
  };
  for (const m of root.listMaterials()) {
    const n = m.getName().toLowerCase();
    const part = n.includes('glasses') ? 'glasses' : n.includes('opacity') ? 'opacity' : n.includes('head') ? 'head' : n.includes('equipment') ? 'equipment' : 'body';
    m.setBaseColorTexture(tex(part, 'color')); m.setNormalTexture(part === 'opacity' || part === 'glasses' ? null : tex(part, 'normal'));
    m.setBaseColorFactor([1, 1, 1, 1]); m.setMetallicFactor(0); m.setRoughnessFactor(part === 'head' ? .55 : .8);
    if (part === 'opacity' || part === 'glasses') { m.setAlphaMode('MASK'); m.setAlphaCutoff(.45); m.setDoubleSided(true); }
  }
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { const c = p.getAttribute('COLOR_0'); if (c) p.setAttribute('COLOR_0', null); }
  for (const a of root.listAnimations()) a.dispose();
  await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${OUT}/chars/${name}.glb`, doc);
  let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  console.log(name.padEnd(20), Math.round(tris), 'tris', (fs.statSync(`${OUT}/chars/${name}.glb`).size / 1024).toFixed(0), 'Ko', root.listMaterials().map(m => m.getName()).join(','));
}
// animations : on ne garde que les rotations + la translation de la racine (Bip01), marche « sur place »
for (const f of fs.readdirSync(`${RB}/anim`).filter(f => f.endsWith('.fbx'))) {
  const name = f.replace('.fbx', '');
  execFileSync(BIN, ['-i', `${RB}/anim/${f}`, '-o', `${RB}/out/anim_${name}`, '--anim-framerate', 'bake30'], { stdio: 'pipe' });
  const doc = await io.read(`${RB}/out/anim_${name}_out/anim_${name}.gltf`);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    a.setName(name);
    for (const ch of a.listChannels()) {
      const node = ch.getTargetNode(), nm = node?.getName() ?? '';
      if (ch.getTargetPath() === 'scale' || (ch.getTargetPath() === 'translation' && nm !== 'Bip01')) { ch.getSampler()?.dispose(); ch.dispose(); continue; }
      if (ch.getTargetPath() === 'translation' && nm === 'Bip01' && name.includes('walk')) {
        const out = ch.getSampler().getOutput(), arr = out.getArray().slice();
        for (let i = 0; i < arr.length; i += 3) { arr[i] = 0; arr[i + 2] = 0; }
        out.setArray(arr);
      }
    }
  }
  await doc.transform(prune(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${OUT}/chars/${name}.glb`, doc);
  console.log('anim', name.padEnd(30), (fs.statSync(`${OUT}/chars/${name}.glb`).size / 1024).toFixed(0), 'Ko', root.listAnimations()[0]?.listChannels().length, 'canaux', root.listAnimations()[0]?.listSamplers()[0]?.getInput()?.getMax([])[0]?.toFixed(1), 's');
}
