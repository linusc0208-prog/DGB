import { sb } from './sb.js';
import { state, setState, subscribe, prefs } from './store.js';
import * as mapx from './map.js';
import { startGeo, requestPosition, isDrivingBlocked } from './geo.js';
import { applyTheme } from './theme.js';
import { registerSW } from './push.js';
import { connectRealtime, disconnectRealtime } from './realtime.js';
import { loadReports, loadCar, loadSession, loadProvider, pruneReports, saveCar, nearestReport, loadMe, fetchReport } from './actions.js';
import { prefetchStreet } from './geocode.js';
import { $, icon, initials, toast, closeAllSheets, fmtDist } from './ui.js';
import { initAuth, showAuth, openNewPassword } from './views/auth.js';
import { quickReport, openReportDetail } from './views/report.js';
import { openCarSheet, promptHandoff } from './views/car.js';
import { openProfile } from './views/profile.js';
import { maybeOnboard } from './views/onboarding.js';
import { renderTop } from './views/alerts.js';

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
  try {
    await loadMe(authUser);
  } catch (e) {
    startingFor = null;
    toast(e.message, { type: 'err', duration: 6000 });
    showAuth();
    return;
  }
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

  $('#report-icon').innerHTML = icon('siren');
  $('#btn-locate').innerHTML = icon('locate');
  $('#btn-report').onclick = () => quickReport();
  $('#btn-car').onclick = () => openCarSheet();
  $('#avatar-btn').onclick = () => openProfile({ onLogout: () => logout() });
  $('#btn-locate').onclick = () => {
    if (state.pos) mapx.flyTo(state.pos, 16);
    else requestPosition().then((p) => mapx.flyTo(p, 16)).catch((e) => toast(e.message, { type: 'err', duration: 6000 }));
  };
  $('#status-btn').onclick = () => {
    if (!state.pos) { requestPosition().catch((e) => toast(e.message, { type: 'err', duration: 6000 })); return; }
    const n = nearestReport(state.pos);
    if (n) openReportDetail(n.id); else mapx.flyTo(state.pos, 16);
  };

  subscribe(() => { mapx.renderReports([...state.reports.values()]); updateStatus(); renderTop(); }, ['reports']);
  subscribe(() => {
    mapx.setMe(state.pos);
    prefetchStreet(state.pos);
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
  subscribe(() => {
    $('#btn-report').classList.toggle('disabled', isDrivingBlocked());
    renderTop();
  }, ['driving', 'passengerUntil']);

  // Alter und Deckkraft regelmäßig auffrischen, abgelaufene Meldungen entfernen
  setInterval(() => { pruneReports(); mapx.renderReports([...state.reports.values()]); updateStatus(); }, 30_000);
  setInterval(() => { if (document.visibilityState === 'visible') loadReports().catch(() => {}); }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { loadReports().catch(() => {}); loadSession().catch(() => {}); }
  });
  window.addEventListener('resize', () => mapx.invalidate());

  // Aus Push-Benachrichtigung geöffnet
  const params = new URLSearchParams(location.search);
  const rid = Number(params.get('report'));
  if (rid || params.get('car')) history.replaceState(null, '', '/');
  if (params.get('car')) setTimeout(() => openCarSheet(), 600);
  if (rid) {
    fetchReport(rid).then((report) => {
      if (report && report.status === 'active') openReportDetail(report.id);
      else toast('Diese Meldung ist nicht mehr aktiv.', { type: 'info' });
    }).catch(() => toast('Diese Meldung ist nicht mehr aktiv.', { type: 'info' }));
  }
}

function updateStatus() {
  const title = $('#status-title');
  const sub = $('#status-sub');
  if (!state.online) { title.textContent = 'ParkRadar'; sub.innerHTML = '<span class="dot off"></span>Verbinde…'; return; }
  if (!state.pos) {
    title.textContent = 'Standort freigeben';
    sub.innerHTML = '<span class="dot off"></span>Tippe hier, um Meldungen um dich zu sehen';
    return;
  }
  const near = [...state.reports.values()].filter((r) => !r.isMine).map((r) => ({ r, d: mapxDistance(state.pos, r) })).filter((x) => x.d <= 1000);
  if (!near.length) {
    title.textContent = 'Alles ruhig';
    sub.innerHTML = '<span class="dot"></span>Keine Meldung im Umkreis von 1 km';
    return;
  }
  const nearest = Math.min(...near.map((x) => x.d));
  title.textContent = `${near.length} Meldung${near.length > 1 ? 'en' : ''} in deiner Nähe`;
  sub.innerHTML = `<span class="dot alert"></span>Nächste ${fmtDist(nearest)} entfernt`;
}

function mapxDistance(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}

function logout() {
  startingFor = null;
  disconnectRealtime();
  closeAllSheets();
  state.reports.clear();
  setState({ user: null, authUser: null, car: null, session: null, reports: state.reports });
  showAuth();
}
