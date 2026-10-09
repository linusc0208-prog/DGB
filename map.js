/* global L, maplibregl */
import { icon, KIND } from './ui.js';

// Karte von OpenFreeMap: kostenlos, ohne API-Key, ohne Anmeldung (https://openfreemap.org)
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
// Notlösung für Geräte ohne WebGL: einfache OpenStreetMap-Kacheln
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const COLORS = { patrol: '#f97316', foot: '#f97316', car: '#ef4444', tow: '#a855f7' };
const AREA_M = 100; // Meldung = Bereich, nicht exakter Punkt

let map;
let base; // Hintergrundkarte (Vektor über MapLibre oder Kacheln)
let baseIsGl = false;
let styleNow;
let meMarker;
let meCircle;
let carMarker;
let carCircle;
const layers = new Map(); // id -> { marker, area, html }
let handlers = {};

export function initMap(el, opts = {}) {
  handlers = opts;
  map = L.map(el, {
    zoomControl: false,
    center: opts.center || [52.5155, 13.4540],
    zoom: opts.zoom || 16,
    maxZoom: 19,
    minZoom: 6,
  });
  addBase(!!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  let t;
  map.on('moveend', () => { clearTimeout(t); t = setTimeout(() => handlers.onMoveEnd?.(), 300); });
  return map;
}

export const getMap = () => map;
export const getCenter = () => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; };
export function viewRadius() {
  const c = map.getCenter();
  return Math.round(Math.min(20000, Math.max(1500, c.distanceTo(map.getBounds().getNorthEast()) * 1.15)));
}
function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

function addBase(dark) {
  const style = dark ? STYLES.dark : STYLES.light;
  if (window.maplibregl && L.maplibreGL && hasWebGL()) {
    try {
      maplibregl.setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.js');
      base = L.maplibreGL({ style }).addTo(map);
      baseIsGl = true;
      styleNow = style;
      return;
    } catch (e) {
      console.warn('Vektorkarte nicht möglich, nutze einfache Kacheln', e);
      try { base?.remove(); } catch { /* */ }
    }
  }
  base = L.tileLayer(OSM_TILES, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map);
  baseIsGl = false;
  map.getContainer().classList.toggle('dark-tiles', dark);
}

export function setMapTheme(dark) {
  if (!base) return;
  if (!baseIsGl) { map.getContainer().classList.toggle('dark-tiles', dark); return; }
  const style = dark ? STYLES.dark : STYLES.light;
  if (style === styleNow) return;
  styleNow = style;
  base.getMaplibreMap()?.setStyle(style);
}
export const flyTo = (p, zoom) => map.flyTo([p.lat, p.lng], zoom ?? Math.max(map.getZoom(), 16), { duration: 0.7 });
export const invalidate = () => map?.invalidateSize();

// ---------- Meldungen: Bereich + Symbol ----------
function pinHtml(r, now) {
  const fresh = now - r.updatedAt < 5 * 60_000;
  const k = KIND[r.kind] || KIND.patrol;
  return `<div class="mk ${r.kind}">
    ${fresh ? '<span class="pulse"></span>' : ''}
    <div class="pin">${icon(k.icon)}</div>
    ${r.confirms ? `<div class="cnt">${r.confirms > 9 ? '9+' : r.confirms}</div>` : ''}
  </div>`;
}

export function renderReports(reports) {
  const now = Date.now();
  const seen = new Set();
  for (const r of reports) {
    seen.add(r.id);
    const h = pinHtml(r, now);
    const color = COLORS[r.kind] || COLORS.patrol;
    const strength = Math.max(0.25, r.confidence / 100);
    let l = layers.get(r.id);
    if (!l) {
      const area = L.circle([r.lat, r.lng], { radius: AREA_M, color, weight: 1.5, opacity: 0.5 * strength, fillColor: color, fillOpacity: 0.2 * strength, interactive: true }).addTo(map);
      const marker = L.marker([r.lat, r.lng], {
        icon: L.divIcon({ html: h, className: '', iconSize: [38, 38], iconAnchor: [19, 19] }),
        title: r.kindLabel,
        zIndexOffset: 500,
      }).addTo(map);
      const open = () => handlers.onReportClick?.(r.id);
      area.on('click', open);
      marker.on('click', open);
      l = { marker, area, html: h };
      layers.set(r.id, l);
    } else {
      if (l.html !== h) { l.marker.setIcon(L.divIcon({ html: h, className: '', iconSize: [38, 38], iconAnchor: [19, 19] })); l.html = h; }
      l.area.setStyle({ color, fillColor: color, opacity: 0.5 * strength, fillOpacity: 0.2 * strength });
    }
    l.marker.setOpacity(0.55 + strength * 0.45);
  }
  for (const [id, l] of layers) {
    if (!seen.has(id)) { l.marker.remove(); l.area.remove(); layers.delete(id); }
  }
}

// ---------- Eigene Position ----------
export function setMe(pos) {
  if (!pos) return;
  const ll = [pos.lat, pos.lng];
  if (!meMarker) {
    meMarker = L.marker(ll, { icon: L.divIcon({ html: '<div class="mk-me"></div>', className: '', iconSize: [20, 20], iconAnchor: [10, 10] }), interactive: false, zIndexOffset: 900 }).addTo(map);
    meCircle = L.circle(ll, { radius: pos.accuracy || 20, color: '#3b82f6', weight: 1, fillOpacity: 0.07, opacity: 0.25, interactive: false }).addTo(map);
  } else {
    meMarker.setLatLng(ll);
    meCircle.setLatLng(ll).setRadius(pos.accuracy || 20);
  }
}

// ---------- Auto (verschiebbar) ----------
export function setCar(car, radius) {
  if (!car) {
    carMarker?.remove(); carCircle?.remove(); carMarker = carCircle = null;
    return;
  }
  const ll = [car.lat, car.lng];
  if (!carMarker) {
    carMarker = L.marker(ll, {
      icon: L.divIcon({ html: `<div class="mk-car">${icon('car')}</div>`, className: '', iconSize: [40, 40], iconAnchor: [20, 20] }),
      zIndexOffset: 800,
      draggable: true,
      title: 'Mein Auto – zum Korrigieren verschieben',
    }).addTo(map);
    carMarker.on('click', () => handlers.onCarClick?.());
    carMarker.on('drag', (e) => carCircle.setLatLng(e.target.getLatLng()));
    carMarker.on('dragend', (e) => { const p = e.target.getLatLng(); handlers.onCarMoved?.({ lat: p.lat, lng: p.lng }); });
    carCircle = L.circle(ll, { radius, color: '#8b5cf6', weight: 2, dashArray: '6 8', fillOpacity: 0.04, interactive: false }).addTo(map);
  } else {
    carMarker.setLatLng(ll);
    carCircle.setLatLng(ll).setRadius(radius);
  }
}
