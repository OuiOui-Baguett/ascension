// Certains navigateurs (fenêtre privée, page intégrée) refusent localStorage et lèvent une
// exception au premier accès : on bascule alors sur une mémoire de session, le jeu tourne quand même.
try {
  const k = '__asc_probe';
  window.localStorage.setItem(k, '1');
  window.localStorage.removeItem(k);
} catch {
  const mem = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  try { Object.defineProperty(window, 'localStorage', { value: shim, configurable: true }); } catch { /* rien */ }
}
export {};
