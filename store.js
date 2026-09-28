// Minimaler globaler Zustand mit Abonnements.
const listeners = new Set();

export const state = {
  user: null,
  authUser: null,        // Supabase-Auth-Nutzer (E-Mail usw.)
  pos: null,            // { lat, lng, accuracy, speed, ts } – bleibt auf dem Gerät
  geoStatus: 'idle',    // idle | watching | denied | unavailable
  driving: false,
  passengerUntil: 0,
  reports: new Map(),   // id -> Meldung
  car: null,            // { lat, lng, street, parkedAt }
  session: null,        // laufender Parkschein { endsAt, … }
  provider: null,       // EasyPark-Links
  online: false,
};

export function setState(patch) {
  const keys = Object.keys(patch);
  Object.assign(state, patch);
  for (const fn of listeners) fn(state, keys);
}

/** fn(state, changedKeys) – optional nur für bestimmte Keys */
export function subscribe(fn, only) {
  const wrapped = only ? (s, keys) => { if (keys.some((k) => only.includes(k))) fn(s, keys); } : fn;
  listeners.add(wrapped);
  return () => listeners.delete(wrapped);
}

export const emitReports = () => setState({ reports: state.reports });

// Komfort-Einstellungen im Browser
export const prefs = {
  get(key, def) {
    try { const v = localStorage.getItem(`pr.${key}`); return v == null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, value) {
    try { localStorage.setItem(`pr.${key}`, JSON.stringify(value)); } catch { /* privater Modus */ }
  },
};
