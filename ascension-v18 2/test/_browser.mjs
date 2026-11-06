// Ouverture du navigateur, au même endroit pour tous les tests.
// Playwright cherche son binaire à un chemin versionné qui ne correspond pas
// toujours à celui installé dans l'image : on le retrouve nous-mêmes.
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

function trouve() {
  if (process.env.CHROMIUM && existsSync(process.env.CHROMIUM)) return process.env.CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base)) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell',
                       'chrome-headless-shell-linux64/chrome-headless-shell']) {
      const p = `${base}/${d}/${rel}`;
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

export const launch = (opts = {}) => chromium.launch({ executablePath: trouve(), ...opts });
export const CHEMIN = trouve();
