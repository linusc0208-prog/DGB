import { state, setState } from './store.js';
import { distance } from './ui.js';

// Fahrmodus: Ab ~20 km/h gilt man als fahrend (§ 23 Abs. 1c StVO – Warnfunktionen während der Fahrt
// sind für Fahrer verboten). Beifahrer können das für 30 Minuten übersteuern.
const DRIVE_ON = 5.5;   // m/s ≈ 20 km/h
const DRIVE_OFF = 2.5;  // m/s ≈ 9 km/h
let fastCount = 0;
let slowSince = 0;
let watchId = null;
let last = null;

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
  if (Date.now() < state.passengerUntil) driving = false;
  setState({ pos: p, geoStatus: 'watching', driving });
}

function onError(err) {
  setState({ geoStatus: err.code === 1 ? 'denied' : 'unavailable' });
}

export function startGeo() {
  if (!('geolocation' in navigator)) { setState({ geoStatus: 'unavailable' }); return; }
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000,
  });
}

/** Einmalige Positionsabfrage (z. B. nach Klick auf "Standort freigeben") */
export function requestPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Dein Browser unterstützt keine Standortabfrage.'));
    navigator.geolocation.getCurrentPosition(
      (p) => { onPosition(p); startGeo(); resolve(state.pos); },
      (e) => { onError(e); reject(new Error(e.code === 1 ? 'Standortzugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben.' : 'Standort konnte nicht ermittelt werden.')); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
}

export function setPassenger() {
  setState({ passengerUntil: Date.now() + 30 * 60_000, driving: false });
}

export function isDrivingBlocked() {
  return state.driving && Date.now() > state.passengerUntil;
}
