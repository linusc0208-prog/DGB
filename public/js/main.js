import { sb } from './sb.js';
import { state, setState, subscribe, prefs } from './store.js';
import * as mapx from './map.js';
import { startGeo, requestPosition, isDrivingBlocked } from './geo.js';
import { applyTheme } from './theme.js';
import { registerSW } from './push.js';
import { connectRealtime, disconnectRealtime } from './realtime.js';
import { loadReports, loadCar, loadSession, loadProvider, pruneReports, saveCar, nearestReport, loadMe, fetchReport } from './actions.js';
import { prefetchStreet } from './geocode.js';
import { $, icon, initials, toast, closeAllSheets, fmtDist, openSheet } from './ui.js';
import { initAuth, showAuth, openNewPassword } from './views/auth.js';
import { quickReport, openReportDetail } from './views/report.js';
import { openCarSheet, promptHandoff } from './views/car.js';
import { openProfile } from './views/profile.js';
import { maybeOnboard } from './views/onboarding.js';
import { renderTop } from './views/alerts.js';
import { refreshStreet, onReportChanged, renderStreet } from './views/street.js';
import { showParkPrompt, parkHere, askParked } from './views/parkprompt.js';
import { showPending, hidePending } from './views/pending.js';
import { openAdmin } from './views/admin.js';

let started = false;
let firstFix = true;

registerSW();
initAuth((authUser) => startApp(authUser));

// Anmeldestatus von Supabase: auch Klicks auf Bestätigungs- und Passwort-Links landen hier
// (Keine Supabase-Aufrufe direkt im Callback – deshalb setTimeout)
sb.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    if (event === 'PASSWORD_RECOVERY') openNewPassword();
    if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) startApp(session.user);
    if (event === 'SIGNED_OUT' && state.user) logout();
  }, 0);
});

(async function boot() {
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.user) await startApp(data.session.user); else showAuth();
  } catch {
    showAuth();
  } finally {
    const s = $('#splash');
    if (s) { s.style.opacity = '0'; setTimeout(() => s.remove(), 300); }
  }
})();

let startingFor = null;
async function startApp(authUser) {
  if (startingFor === authUser.id) return; // schon gestartet
  startingFor = authUser.id;
  setState({ authUser });
  let me;
  try {
    me = await loadMe(authUser);
  } catch (e) {
    startingFor = null;
    toast(e.message, { type: 'err', duration: 6000 });
    showAuth();
    return;
  }
  // Noch nicht freigeschaltet: Warte-Bildschirm statt App
  if (me.access !== 'approved') {
    showPending(me, {
      onApproved: () => { startingFor = null; startApp(authUser); },
      onLogout: () => logout(),
    });
    return;
  }
  hidePending();
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  if (!started) setup();
  startGeo();
  connectRealtime();
  loadProvider();
  loadReports().catch(() => {});
  loadCar().catch(() => {});
  loadSession().then(() => promptHandoff()).catch(() => {});
  if (location.hash.includes('access_token')) history.replaceState(null, '', '/');
  setTimeout(maybeOnboard, 500);
}

function setup() {
  started = true;
  const saved = prefs.get('mapView', null);
  mapx.initMap($('#map'), {
    center: saved ? [saved.lat, saved.lng] : undefined,
    zoom: saved?.zoom,
    onMoveEnd() {
      const c = mapx.getCenter();
      prefs.set('mapView', { lat: c.lat, lng: c.lng, zoom: mapx.getMap().getZoom() });
      loadReports().catch(() => {});
    },
    onReportClick: (id) => openReportDetail(id),
    onCarClick: () => openCarSheet(),
    async onCarMoved(p) {
      try { await saveCar(p); toast('Parkplatz korrigiert.', { type: 'ok', duration: 2000 }); } catch (e) { toast(e.message, { type: 'err' }); }
    },
  });
  applyTheme();

  $('#report-icon').innerHTML = icon('slip');
  $('#btn-locate').innerHTML = icon('locate');
  $('#btn-report').onclick = () => quickReport();
  $('#btn-car').onclick = () => openCarSheet();
  $('#avatar-btn').onclick = () => openProfile({ onLogout: () => logout() });
  $('#btn-locate').onclick = () => {
    if (state.pos) mapx.flyTo(state.pos, 16);
    else locateMe();
  };
  $('#status-btn').onclick = () => {
    if (!state.pos) { locateMe(); return; }
    const n = nearestReport(state.pos);
    if (n) openReportDetail(n.id); else mapx.flyTo(state.pos, 16);
  };

  const seenReports = new Set();
  subscribe(() => {
    mapx.renderReports([...state.reports.values()]);
    updateStatus();
    renderTop();
    for (const r of state.reports.values()) if (!seenReports.has(r.id)) { seenReports.add(r.id); onReportChanged(r); }
  }, ['reports']);
  subscribe(() => {
    mapx.setMe(state.pos);
    prefetchStreet(state.pos);
    refreshStreet();
    if (firstFix && state.pos) {
      firstFix = false;
      if (!new URLSearchParams(location.search).get('report')) mapx.flyTo(state.pos, 16);
      loadReports(state.pos, 3000).catch(() => {});
    }
    updateStatus();
  }, ['pos', 'geoStatus', 'online']);
  subscribe(() => {
    mapx.setCar(state.car, state.user?.alertRadius || 300);
    $('#btn-car').innerHTML = icon('car', 'lg') + (state.car ? '' : `<span class="plus">${icon('plus')}</span>`);
    $('#avatar-btn').textContent = initials(state.user?.name);
    renderTop();
  }, ['car', 'user', 'session']);
  let wasDriving = false;
  subscribe(() => {
    $('#btn-report').classList.toggle('disabled', isDrivingBlocked());
    renderTop();
    renderStreet();
    // Fahrt zu Ende (nicht durch Beifahrer-Modus) → "Geparkt?"
    if (wasDriving && !state.driving && Date.now() > state.passengerUntil && document.visibilityState === 'visible') askParked();
    wasDriving = state.driving;
  }, ['driving', 'passengerUntil']);

  // Alter und Deckkraft regelmäßig auffrischen, abgelaufene Meldungen entfernen
  setInterval(() => { pruneReports(); mapx.renderReports([...state.reports.values()]); updateStatus(); }, 30_000);
  setInterval(() => { if (document.visibilityState === 'visible') { loadReports().catch(() => {}); refreshStreet(); } }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { loadReports().catch(() => {}); loadSession().catch(() => {}); }
  });
  window.addEventListener('resize', () => mapx.invalidate());

  // Aus Push-Benachrichtigung geöffnet
  const params = new URLSearchParams(location.search);
  const rid = Number(params.get('report'));
  if (rid || params.get('car') || params.get('parked')) history.replaceState(null, '', '/');
  if (params.get('requests')) history.replaceState(null, '', '/');
  if (params.get('requests')) setTimeout(() => openAdmin(), 700);
  else if (params.get('parked')) setTimeout(() => parkHere(), 800); // z. B. aus einer Kurzbefehl-Automation beim Aussteigen
  else if (params.get('park')) setTimeout(() => showParkPrompt(), 1200);
  else if (params.get('car')) setTimeout(() => openCarSheet(), 600);
  if (rid) {
    fetchReport(rid).then((report) => {
      if (report && report.status === 'active') openReportDetail(report.id);
      else toast('Diese Meldung ist nicht mehr aktiv.', { type: 'info' });
    }).catch(() => toast('Diese Meldung ist nicht mehr aktiv.', { type: 'info' }));
  }
}

function locateMe() {
  if (state.geoStatus === 'denied') { openLocationHelp(true); return; }
  if (state.geoStatus === 'locating') { toast('Dein Standort wird gerade gesucht …', { duration: 2500 }); return; }
  requestPosition().then((p) => mapx.flyTo(p, 16)).catch(() => openLocationHelp(state.geoStatus === 'denied'));
}

function openLocationHelp(denied) {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const device = ios
    ? '<b>iPhone:</b> Einstellungen → Datenschutz &amp; Sicherheit → <b>Ortungsdienste</b> an. Weiter unten bei <b>Safari-Websites</b> „Beim Verwenden der App“ wählen.'
    : android
      ? '<b>Android:</b> In den Schnelleinstellungen <b>Standort</b> einschalten. In Chrome: Einstellungen → Website-Einstellungen → Standort.'
      : '<b>Windows:</b> Einstellungen → Datenschutz und Sicherheit → <b>Standort</b>. Dort „Standortdienste“ und „Desktop-Apps Zugriff auf Ihren Standort erlauben“ einschalten.';
  openSheet({
    title: denied ? 'Standort ist blockiert' : 'Standort nicht gefunden',
    body: `<p class="muted" style="margin:0 0 12px">${denied
      ? 'Dein Browser lässt die App deinen Standort nicht sehen. So schaltest du ihn frei:'
      : 'Dein Gerät hat keinen Standort geliefert. Meist liegt es an einer dieser Einstellungen:'}</p>
      <ol style="margin:0 0 16px;padding-left:20px;line-height:1.5">
        <li style="margin-bottom:8px"><b>Im Browser:</b> Links neben der Adresse auf das <b>Schloss-Symbol</b> tippen → <b>Standort</b> → <b>Zulassen</b>.</li>
        <li style="margin-bottom:8px">${device}</li>
        <li>Danach die Seite <b>neu laden</b>.</li>
      </ol>
      <button class="btn primary block" data-retry>Nochmal versuchen</button>`,
    onMount(el, sheet) {
      $('[data-retry]', el).onclick = () => { sheet.close(); location.reload(); };
    },
  });
}

function updateStatus() {
  const title = $('#status-title');
  const sub = $('#status-sub');
  if (!state.online) { title.textContent = 'ParkCheck'; sub.innerHTML = '<span class="dot off"></span>Verbinde…'; return; }
  if (!state.pos) {
    const g = state.geoStatus;
    title.textContent = g === 'locating' ? 'Suche deinen Standort…' : g === 'denied' ? 'Standort blockiert' : g === 'unavailable' ? 'Standort nicht gefunden' : 'Standort freigeben';
    sub.innerHTML = `<span class="dot off"></span>${g === 'locating' ? 'Einen Moment' : g === 'denied' || g === 'unavailable' ? 'Tippe hier für Hilfe' : 'Tippe hier, um Tickets um dich zu sehen'}`;
    return;
  }
  const near = [...state.reports.values()].filter((r) => !r.isMine).map((r) => ({ r, d: mapxDistance(state.pos, r) })).filter((x) => x.d <= 1000);
  if (!near.length) {
    title.textContent = 'Keine aktuellen Meldungen';
    sub.innerHTML = '<span class="dot off"></span>Die Parkregeln gelten trotzdem';
    return;
  }
  const nearest = Math.min(...near.map((x) => x.d));
  title.textContent = `${near.length} Ticket${near.length > 1 ? 's' : ''} in deiner Nähe`;
  sub.innerHTML = `<span class="dot alert"></span>Nächste ${fmtDist(nearest)} entfernt`;
}

function mapxDistance(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}

function logout() {
  startingFor = null;
  hidePending();
  disconnectRealtime();
  closeAllSheets();
  state.reports.clear();
  setState({ user: null, authUser: null, car: null, session: null, reports: state.reports });
  showAuth();
}
