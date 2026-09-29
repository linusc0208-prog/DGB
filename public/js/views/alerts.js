import { state } from '../store.js';
import { nearestReport } from '../actions.js';
import { setPassenger, isDrivingBlocked } from '../geo.js';
import { localNotify } from '../push.js';
import { icon, esc, html, $, beep, haptic, toast, fmtDuration, fmtDist, timeAgo } from '../ui.js';
import { openCarSheet, startParking } from './car.js';
import { openReportDetail } from './report.js';

const shown = new Set();

/** Großer Hinweis: In der Nähe des eigenen Autos wurde ein Ticket gemeldet */
export function showCarAlert(p) {
  if (shown.has(p.tag)) return;
  shown.add(p.tag);
  if (document.visibilityState !== 'visible') localNotify(p);
  if (isDrivingBlocked()) return;
  beep();
  haptic([250, 120, 250, 120, 400]);
  $('.alarm')?.remove();
  const parking = !!state.session;
  const el = html(`
    <div class="alarm" role="alertdialog" aria-label="Hinweis">
      <div class="alarm-card">
        <div class="alarm-top">
          <div class="ico">${icon('slip', 'lg')}</div>
          <div><b>${esc(p.title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, ''))}</b><small>${p.street ? `${esc(p.street)} · ` : ''}Prüfe, ob dein Parkschein gilt.</small></div>
        </div>
        <div class="alarm-body">
          ${parking
            ? `<div class="box ok" style="margin:0"><span class="ico">${icon('check')}</span><div class="grow"><b>Dein Parkschein läuft</b><span class="small muted">noch <span data-left>${fmtDuration(state.session.endsAt - Date.now())}</span></span></div></div>`
            : `<button class="btn ep block" data-park style="min-height:58px;font-size:16.5px">${icon('ticket')} Jetzt Parkschein lösen</button>`}
          <div class="row" style="gap:8px">
            <button class="btn outline grow" data-show>${icon('map', 'sm')} Auf Karte</button>
            <button class="btn ghost grow" data-close>Schließen</button>
          </div>
        </div>
      </div>
    </div>`);
  document.body.append(el);
  const close = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  $('[data-close]', el).onclick = close;
  $('[data-show]', el).onclick = () => { close(); if (p.reportId) openReportDetail(p.reportId); };
  $('[data-park]', el)?.addEventListener('click', () => { close(); startParking(); });
}

export function showParkingReminder(p) {
  const key = `${p.tag}-${state.session?.endsAt}`;
  if (shown.has(key)) return;
  shown.add(key);
  if (document.visibilityState !== 'visible') localNotify(p);
  beep();
  haptic([200, 100, 200]);
  toast(p.title.replace(/^⏱️\s*/, ''), { type: 'warn', action: 'Verlängern', onAction: () => openCarSheet(), duration: 10000 });
}

// ================= Leiste oben: Fahrmodus + Auto-Status =================
export function renderTop() {
  // Fahrmodus
  const drive = $('#drive-bar');
  drive.innerHTML = isDrivingBlocked()
    ? `<div class="drive glass"><span class="ico">${icon('wheel')}</span><div class="grow"><b>Fahrmodus</b> – Melden & Hinweise pausiert</div><button class="btn sm" data-passenger>Beifahrer</button></div>`
    : '';
  $('[data-passenger]', drive)?.addEventListener('click', () => { setPassenger(); toast('Beifahrer-Modus für 30 Minuten.'); });

  // Auto
  const bar = $('#car-bar');
  const car = state.car;
  const s = state.session;
  if (!car && !s) { bar.innerHTML = ''; return; }
  const radius = state.user?.alertRadius || 300;
  const near = car ? nearestReport(car, radius) : null;
  const timer = s ? `<span class="pill timer">${icon('timer', 'sm')}<span data-left>${fmtDuration(s.endsAt - Date.now())}</span></span>` : '';
  let cls = s ? 'parking' : 'todo';
  let title = s ? 'Parkschein läuft' : 'Parkschein?';
  let sub = car ? `${car.street ? `${esc(car.street)} · ` : ''}${s ? 'Countdown & Erinnerung aktiv' : 'noch keiner erfasst'}` : 'über EasyPark';
  let action = timer || `<span class="pill" data-park>${icon('ticket', 'sm')}Parkschein</span>`;
  if (near) {
    cls = 'alert';
    title = `${fmtDist(near.d)} vom Auto`;
    sub = [near.kind === 'tow' ? 'Abschleppen gemeldet' : 'Ticket gemeldet', near.kind === 'foot' || near.kind === 'car' ? esc(near.kindLabel) : null, near.street ? esc(near.street) : null, timeAgo(near.createdAt)].filter(Boolean).join(' · ');
  }
  bar.innerHTML = `<button class="carbar glass ${cls}"><span class="ico">${icon(near ? 'slip' : s ? 'parking' : 'car')}</span>
    <span class="grow"><b>${title}</b><small>${sub}</small></span>${action}</button>`;
  $('.carbar', bar).onclick = (e) => {
    if (e.target.closest('[data-park]')) startParking(); else openCarSheet();
  };
}
