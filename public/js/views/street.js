// Straßen-Info: Wie viele Tickets wurden in der Straße gemeldet, in der du gerade bist – und wann zuletzt?
import { state } from '../store.js';
import { rpc } from '../sb.js';
import { streetAt } from '../geocode.js';
import { icon, esc, $, openSheet, timeAgo, fmtDate, distance } from '../ui.js';
import { openCarSheet } from './car.js';

let current = null; // { street, stats, at, pos }
let loading = false;
let sheet = null;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Statistik für die Straße am aktuellen Standort laden (sparsam: nur bei Ortswechsel oder nach 2 Minuten) */
export async function refreshStreet({ force = false } = {}) {
  const p = state.pos;
  if (!p || loading) return;
  if (!force && current && distance(current.pos, p) < 30 && Date.now() - current.at < 120_000) return;
  loading = true;
  try {
    const street = await streetAt(p, 4000);
    if (!street) { if (!current || distance(current.pos, p) > 150) { current = null; render(); } return; }
    const stats = await rpc('street_stats', { p_lat: p.lat, p_lng: p.lng, p_street: street });
    current = { street, stats, at: Date.now(), pos: p };
    render();
    if (sheet) sheet.setBody(sheetBody());
  } catch {
    /* Statistik ist ein Extra – ohne sie läuft alles weiter */
  } finally {
    loading = false;
  }
}

/** Nach einer neuen Meldung in derselben Straße sofort auffrischen */
export function onReportChanged(r) {
  if (current && r?.street && r.street.toLowerCase() === current.street.toLowerCase()) refreshStreet({ force: true });
}

function summary(s) {
  if (!s || !s.total) return 'Noch keine Meldungen · Parkregeln beachten';
  const last = s.last ? `zuletzt ${timeAgo(Date.parse(s.last))}` : '';
  const count = s.month ? `${plural(s.month, 'Ticket', 'Tickets')} in 30 Tagen` : `${plural(s.total, 'Ticket', 'Tickets')} in 90 Tagen`;
  return [count, last].filter(Boolean).join(' · ');
}

/** Häufigste Uhrzeit: bestes 3-Stunden-Fenster, wenn es genug Meldungen gibt */
function busiest(hours) {
  if (!Array.isArray(hours) || hours.reduce((a, b) => a + b, 0) < 3) return null;
  let best = 0; let bestSum = -1;
  for (let h = 0; h < 24; h++) {
    const sum = hours[h] + hours[(h + 1) % 24] + hours[(h + 2) % 24];
    if (sum > bestSum) { bestSum = sum; best = h; }
  }
  return `${best}–${(best + 3) % 24 || 24} Uhr`;
}

function render() {
  const bar = $('#street-bar');
  if (!bar) return;
  if (!current || state.driving) { bar.innerHTML = ''; return; }
  const s = current.stats;
  const hot = s?.today > 0 || (s?.last && Date.now() - Date.parse(s.last) < 3 * 3600_000);
  bar.innerHTML = `<button class="streetbar glass ${hot ? 'hot' : ''}" aria-label="Tickets in dieser Straße">
    <span class="ico">${icon('street', 'sm')}</span>
    <span class="grow"><b>${esc(current.street)}</b><small>${esc(summary(s))}</small></span>
    ${icon('chevron', 'sm')}</button>`;
  $('.streetbar', bar).onclick = openStreetSheet;
}

function sheetBody() {
  if (!current) return '<p class="muted">Keine Straße erkannt.</p>';
  const s = current.stats || {};
  const peak = busiest(s.hours);
  const lastTs = s.last ? Date.parse(s.last) : null;
  return `
    <div class="stat-grid">
      <div><b>${s.today || 0}</b><span>heute</span></div>
      <div><b>${s.week || 0}</b><span>7 Tage</span></div>
      <div><b>${s.month || 0}</b><span>30 Tage</span></div>
    </div>
    <div class="box"><span class="ico">${icon('clock')}</span><div class="grow small">
      <b>${lastTs ? `Zuletzt ${timeAgo(lastTs)}` : 'Noch kein Ticket gemeldet'}</b>
      ${lastTs ? `am ${fmtDate(lastTs)} Uhr` : 'in den letzten 90 Tagen'}</div></div>
    ${peak ? `<div class="box"><span class="ico">${icon('timer')}</span><div class="grow small"><b>Meist gemeldet: ${peak}</b>über die letzten 90 Tage</div></div>` : ''}
    <p class="small muted" style="margin:0 0 12px">${s.total ? 'Hier werden Tickets vergeben – denk an deinen Parkschein. ' : 'Keine Meldungen heißt nicht, dass hier keine Tickets vergeben werden. '}Bitte beachte die Parkregeln. Gezählt werden Meldungen aus der Community im Umkreis von etwa 2 km mit diesem Straßennamen.</p>
    <button class="btn ep block" data-park style="min-height:54px">${icon('ticket')} Parkschein lösen</button>`;
}

function openStreetSheet() {
  if (!current) return;
  sheet = openSheet({
    title: current.street,
    body: sheetBody(),
    onMount(el, sh) {
      el.addEventListener('click', (e) => { if (e.target.closest('[data-park]')) { sh.close(); openCarSheet({ park: true }); } });
    },
    onClose: () => { sheet = null; },
  });
  refreshStreet({ force: true });
}

export const renderStreet = render;
/** Zuletzt geladene Straßen-Statistik (für den Parkschein-Hinweis) */
export const currentStreet = () => current;
