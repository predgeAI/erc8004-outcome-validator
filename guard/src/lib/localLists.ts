/** Watchlist in this browser, with an event so every view refreshes when the passkey vault rewrites it. */
const WATCH_KEY = "guard.watchlist";
export const WATCH_EVENT = "guard-watch";
export const ACKS_EVENT = "guard-acks";

export const readWatchlist = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(WATCH_KEY) || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};
export const writeWatchlist = (l: string[] | null) => {
  try { if (l === null) localStorage.removeItem(WATCH_KEY); else localStorage.setItem(WATCH_KEY, JSON.stringify(l.slice(0, 50))); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(WATCH_EVENT));
};
