// Datenzugriffe (Supabase), die von mehreren Ansichten genutzt werden.
import { sb, rpc, toReport, toCar, toSession, toUser, cfg, AppError, friendly, getAccessToken } from './sb.js';
import { state, setState, emitReports } from './store.js';
import * as mapx from './map.js';
import { distance } from './ui.js';
import { streetAt } from './geocode.js';

// ---------- Meldungen ----------
/** Meldungen um einen Punkt laden und mit dem Bestand zusammenführen. */
export async function loadReports(center = mapx.getCenter(), radius = mapx.viewRadius()) {
  const rows = await rpc('reports_near', { p_lat: center.lat, p_lng: center.lng, p_radius: Math.round(radius) });
  const ids = new Set(rows.map((r) => Number(r.id)));
  for (const [id, r] of state.reports) {
    if (!ids.has(id) && distance(center, r) <= radius) state.reports.delete(id);
  }
  for (const row of rows) state.reports.set(Number(row.id), toReport(row, state.reports.get(Number(row.id))));
  pruneReports(false);
  emitReports();
}

export function pruneReports(emit = true) {
  const now = Date.now();
  let changed = false;
  for (const [id, r] of state.reports) {
    if (r.expiresAt < now || r.status !== 'active') { state.reports.delete(id); changed = true; }
  }
  if (changed && emit) emitReports();
}

/** Zeile aus RPC oder Realtime übernehmen */
export function upsertRow(row) {
  const id = Number(row.id);
  const r = toReport(row, state.reports.get(id));
  if (r.status !== 'active') state.reports.delete(id);
  else state.reports.set(id, r);
  emitReports();
  return r;
}

export function removeReport(id) {
  if (state.reports.delete(Number(id))) emitReports();
}

export async function createReport(pos) {
  const street = await streetAt(pos);
  const res = await rpc('create_report', { p_lat: pos.lat, p_lng: pos.lng, p_street: street });
  return { merged: res.merged, own: !!res.own, report: upsertRow(res.report) };
}
export async function setReportKind(id, kind) {
  upsertRow(await rpc('set_report_kind', { p_id: id, p_kind: kind }));
}
export async function undoReport(id) {
  await rpc('delete_report', { p_id: id });
  removeReport(id);
}
export async function voteReport(id, value) {
  return upsertRow(await rpc('vote_report', { p_id: id, p_value: value }));
}
export async function fetchReport(id) {
  const row = await rpc('report_get', { p_id: id });
  return row ? upsertRow(row) : null;
}

/** Nächste aktive Meldung (ohne eigene) zu einem Punkt */
export function nearestReport(p, maxM = Infinity, { includeOwn = false } = {}) {
  if (!p) return null;
  let best = null;
  for (const r of state.reports.values()) {
    if (r.isMine && !includeOwn) continue;
    const d = distance(p, r);
    if (d <= maxM && (!best || d < best.d)) best = { ...r, d };
  }
  return best;
}

// ---------- Auto ----------
export async function loadCar() {
  const { data, error } = await sb.from('cars').select('*').maybeSingle();
  if (error) throw new AppError(friendly(error));
  setState({ car: toCar(data) });
}
export async function saveCar(pos) {
  const street = await streetAt(pos);
  const car = toCar(await rpc('set_car', { p_lat: pos.lat, p_lng: pos.lng, p_street: street }));
  setState({ car });
  return car;
}
/**
 * Auto speichern, während die App gerade in den Hintergrund geht (Handy gesperrt).
 * keepalive sorgt dafür, dass die Anfrage auch dann noch ankommt.
 */
export async function saveCarKeepalive(pos) {
  const token = getAccessToken();
  if (!token || !cfg.supabaseUrl) return;
  const street = await streetAt(pos, 400);
  try {
    await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/set_car`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ p_lat: pos.lat, p_lng: pos.lng, p_street: street }),
    });
  } catch { /* nächster Versuch beim nächsten Halt */ }
}

/** Automatische Park-Erkennung an/aus */
export async function setAutoPark(on) {
  const user = toUser(await rpc('set_auto_park', { p_on: !!on }), state.authUser);
  setState({ user });
  return user;
}

/** Erinnerung beim Parken an/aus */
export async function setParkReminder(on) {
  const user = toUser(await rpc('set_park_reminder', { p_on: !!on }), state.authUser);
  setState({ user });
  return user;
}
/** Für den aktuellen Parkplatz keine Parkschein-Erinnerung mehr schicken */
export const dismissParkPrompt = () => rpc('dismiss_park_prompt').catch(() => {});

export async function removeCar() {
  await rpc('remove_car');
  setState({ car: null });
}

// ---------- Parkschein ----------
export async function loadSession() {
  const { data, error } = await sb.from('parking_sessions').select('*').eq('status', 'active')
    .order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new AppError(friendly(error));
  setState({ session: toSession(data) });
}
export async function startSession(minutes) {
  const session = toSession(await rpc('start_parking', { p_minutes: minutes }));
  setState({ session });
  return session;
}
export async function extendSession(minutes) {
  const session = toSession(await rpc('extend_parking', { p_minutes: minutes }));
  setState({ session });
  return session;
}
export async function stopSession() {
  await rpc('stop_parking');
  setState({ session: null });
}

/** EasyPark-Links (keine öffentliche API – die App wird geöffnet) */
export function loadProvider() {
  const pkg = cfg.easyparkAndroidPackage || 'net.easypark.android';
  const play = `https://play.google.com/store/apps/details?id=${pkg}`;
  const provider = {
    id: 'easypark',
    links: {
      android: `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};S.browser_fallback_url=${encodeURIComponent(play)};end`,
      ios: cfg.easyparkIosScheme || 'easypark://',
      iosStore: cfg.easyparkIosStore || 'https://apps.apple.com/de/app/easypark-parken-leicht-gemacht/id449594317',
      androidStore: play,
      web: 'https://www.easypark.com/de-de',
    },
  };
  setState({ provider });
  return Promise.resolve(provider);
}

// ---------- Profil ----------
export async function loadMe(authUser) {
  const profile = await rpc('get_profile');
  const user = toUser(profile, authUser || state.authUser);
  setState({ user });
  return user;
}
export async function updateMe({ name, alertRadius } = {}) {
  const profile = await rpc('update_profile', { p_name: name ?? null, p_alert_radius: alertRadius ?? null });
  const user = toUser(profile, state.authUser);
  setState({ user });
  return user;
}
