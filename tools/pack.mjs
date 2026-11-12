// Emballe les fichiers que l'hébergeur d'aperçu ne sert pas (.glb, .hdr) en JSON base64.
import fs from 'node:fs';
const dir = process.argv[2];
for (const sub of ['res/models', 'res/env', 'res/chars']) {
  for (const f of fs.readdirSync(`${dir}/${sub}`)) {
    if (!/\.(glb|hdr)$/.test(f)) continue;
    const p = `${dir}/${sub}/${f}`;
    fs.writeFileSync(p + '.json', JSON.stringify(fs.readFileSync(p).toString('base64')));
    fs.unlinkSync(p);
  }
}
console.log('ok');
