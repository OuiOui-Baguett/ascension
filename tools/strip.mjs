// Version publiée : l'hébergeur fournit lui-même doctype/html/head/body → on ne garde que le contenu.
import fs from 'node:fs';
const p = process.argv[2];
let h = fs.readFileSync(p, 'utf8');
const head = h.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/,'').replace(/<meta name="viewport"[^>]*>\s*/,'');
const body = h.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.writeFileSync(p, head.trim() + '\n' + body.trim() + '\n');
console.log(fs.readFileSync(p, 'utf8').slice(0, 600));
