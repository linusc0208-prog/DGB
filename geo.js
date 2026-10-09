import { state, setState, subscribe } from './store.js';
import { distance } from './ui.js';

// Fahrmodus: Ab ~20 km/h gilt man als fahrend (§ 23 Abs. 1c StVO – Warnfunktionen während der Fahrt
// sind für Fahrer verboten). Beifahrer können das für 30 Minuten übersteuern.
const DRIVE_ON = 5.5;   // m/s ≈ 20 km/h
const DRIVE_OFF = 2.5;  // m/s ≈ 9 km/h
let fastCount = 0;
let slowSince = 0;
let watchId = null;
let last = null;
// Park-Erkennung: letzte Fahrt (≥ 20 km/h) und erster langsamer Punkt danach – bleibt auf dem Gerät
let lastDriveAt = 0;
let stop = null;

function speedFrom(pos) {
  if (pos.coords.speed != null && !Number.isNaN(pos.coords.speed)) return pos.coords.speed;
  if (!last) return 0;
  const dt = (pos.timestamp - last.ts) / 1000;
  if (dt < 2) return state.pos?.speed ?? 0;
  return distance(last, { lat: pos.coords.latitude, lng: pos.coords.longitude }) / dt;
}

function onPosition(pos) {
  const speed = speedFrom(pos);
  const p = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Math.round(pos.coords.accuracy || 0),
    speed,
    ts: pos.timestamp || Date.now(),
  };
  last = p;

  let driving = state.driving;
  if (speed > DRIVE_ON && (pos.coords.accuracy || 0) < 60) {
    fastCount++;
    slowSince = 0;
    if (fastCount >= 2) driving = true;
  } else if (speed < DRIVE_OFF) {
    fastCount = 0;
    slowSince ||= Date.now();
    if (Date.now() - slowSince > 20_000) driving = false;
  }
  if (speed > DRIVE_ON && (pos.coords.accuracy || 0) < 60) {
    if (fastCount >= 2) lastDriveAt = Date.now();
    stop = null;
  } else if (lastDriveAt && speed < DRIVE_OFF && !stop) {
    stop = { lat: p.lat, lng: p.lng, at: Date.now() };
  }
  if (Date.now() < state.passengerUntil) driving = false;
  setState({ pos: p, geoStatus: 'watching', driving });
}

function onError(err) {
  // Kurze Aussetzer egal, solange wir schon eine Position haben
  if (err.code !== 1 && state.pos) return;
  setState({ geoStatus: err.code === 1 ? 'denied' : 'unavailable' });
}

const once = (opts) => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts));

export function startGeo() {
  if (!('geolocation' in navigator)) { setState({ geoStatus: 'unavailable' }); return; }
  if (watchId != null) return;
  if (!state.pos) setState({ geoStatus: 'locating' });
  // Schnelle, grobe Position zuerst (WLAN/Mobilfunk) – wichtig für Laptops ohne GPS
  once({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }).then(onPosition).catch(() => {});
  watchId = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000,
  });
}

/** Einmalige Positionsabfrage (z. B. nach Klick auf "Standort freigeben") */
export async function requestPosition() {
  if (!('geolocation' in navigator)) throw new Error('Dein Browser unterstützt keine Standortabfrage.');
  setState({ geoStatus: 'locating' });
  let pos;
  try {
    pos = await once({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  } catch (e) {
    if (e.code === 1) { onError(e); throw new Error('Standortzugriff ist blockiert.'); }
    try {
      pos = await once({ enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    } catch (e2) {
      onError(e2);
      throw new Error(e2.code === 1 ? 'Standortzugriff ist blockiert.' : 'Standort konnte nicht ermittelt werden.');
    }
  }
  onPosition(pos);
  if (watchId == null) startGeo();
  return state.pos;
}

/** Möglichst genaue Position fürs Parken: wartet kurz auf GPS (≤ 40 m), sonst die beste bekannte */
export function goodPosition({ maxAccuracy = 40, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const ok = () => state.pos && state.pos.accuracy <= maxAccuracy && Date.now() - state.pos.ts < 30_000;
    if (ok()) { resolve(state.pos); return; }
    startGeo();
    let un = () => {};
    const t = setTimeout(() => {
      un();
      if (state.pos) resolve(state.pos); else requestPosition().then(resolve, reject);
    }, timeoutMs);
    un = subscribe(() => { if (ok()) { clearTimeout(t); un(); resolve(state.pos); } }, ['pos']);
  });
}

/** Haltepunkt nach einer Fahrt (oder null) */
export const stopCandidate = () => (stop && lastDriveAt ? { ...stop, drivenAt: lastDriveAt } : null);
export function clearStop() { stop = null; lastDriveAt = 0; }

export function setPassenger() {
  setState({ passengerUntil: Date.now() + 30 * 60_000, driving: false });
}

export function isDrivingBlocked() {
  return state.driving && Date.now() > state.passengerUntil;
}
