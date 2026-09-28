// Straßenname zu einer Koordinate – direkt vom Gerät über Nominatim (OpenStreetMap).
// Ergebnisse werden im ~10-m-Raster gemerkt; fällt der Dienst aus, geht es ohne Straßennamen weiter.
import { cfg } from './sb.js';

const cache = new Map();
const base = (cfg.geocoderUrl ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const key = (p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

/** "Boxhagener Straße" -> "Boxhagener Str." */
export function shortStreet(name) {
  if (!name) return null;
  return name.replace(/(s)tra(ß|ss)e(?=$|[\s,])/i, (m, s1) => `${s1}tr.`);
}

async function lookup(p) {
  const url = `${base}/reverse?format=jsonv2&lat=${p.lat.toFixed(6)}&lon=${p.lng.toFixed(6)}&zoom=17&addressdetails=1&accept-language=de`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Geocoder ${res.status}`);
  const a = (await res.json()).address || {};
  return shortStreet(a.road || a.pedestrian || a.square || a.footway || a.living_street || a.neighbourhood || a.quarter || a.suburb || null);
}

/** Straßenname holen, höchstens timeoutMs warten */
export function streetAt(p, timeoutMs = 1200) {
  if (!p || !base || cfg.geocoderUrl === 'off') return Promise.resolve(null);
  const k = key(p);
  if (!cache.has(k)) {
    cache.set(k, lookup(p).catch(() => { cache.delete(k); return null; }));
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  return Promise.race([cache.get(k), new Promise((r) => setTimeout(() => r(null), timeoutMs))]);
}

/** Straßennamen für den aktuellen Standort schon vorab holen, damit Melden sofort geht */
let lastPrefetch = null;
export function prefetchStreet(p) {
  if (!p) return;
  if (lastPrefetch && Math.abs(lastPrefetch.lat - p.lat) < 0.0002 && Math.abs(lastPrefetch.lng - p.lng) < 0.0003) return;
  lastPrefetch = p;
  streetAt(p, 0);
}
