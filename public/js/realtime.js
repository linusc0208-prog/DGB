// Live-Updates über Supabase Realtime: Meldungen, eigene Benachrichtigungen, eigener Parkschein.
import { sb, toSession } from './sb.js';
import { state, setState } from './store.js';
import { upsertRow, removeReport, loadReports, loadMe } from './actions.js';
import { showCarAlert, showParkingReminder } from './views/alerts.js';
import { showParkPrompt } from './views/parkprompt.js';
import { openAdmin } from './views/admin.js';
import { showAnnouncement } from './views/news.js';
import { toast } from './ui.js';

let lastRequestToast = 0;
function onAccessRequest(p) {
  if (Date.now() - lastRequestToast < 3000) return; // Realtime + Push nicht doppelt
  lastRequestToast = Date.now();
  loadMe().catch(() => {});
  toast(p.body || 'Neue Zugangsanfrage', { action: 'Ansehen', onAction: () => openAdmin(), duration: 8000 });
}

let channel = null;
let wasOnline = false;

function onOutbox(row) {
  const p = row.payload || {};
  if (row.kind === 'car_alert') showCarAlert(p);
  else if (row.kind === 'parking_reminder') showParkingReminder(p);
  else if (row.kind === 'park_prompt') showParkPrompt(p);
  else if (row.kind === 'access_request') onAccessRequest(p);
  else if (row.kind === 'announcement') showAnnouncement(p);
}

export function connectRealtime() {
  disconnectRealtime();
  const uid = state.user?.id;
  if (!uid) return;
  channel = sb.channel(`parkradar-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, (msg) => {
      if (msg.eventType === 'DELETE') removeReport(msg.old.id);
      else upsertRow(msg.new);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'outbox', filter: `user_id=eq.${uid}` }, (msg) => onOutbox(msg.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_sessions', filter: `user_id=eq.${uid}` }, (msg) => {
      const s = msg.new;
      if (s?.status === 'active') setState({ session: toSession(s) });
      else if (state.session && Number(s?.id) === state.session.id) setState({ session: null });
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (wasOnline && !state.online) loadReports().catch(() => {});
        wasOnline = true;
        setState({ online: true });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setState({ online: false });
      }
    });
}

export function disconnectRealtime() {
  if (channel) sb.removeChannel(channel);
  channel = null;
}

// Push-Nachrichten, während die App offen ist, kommen vom Service Worker hierher
navigator.serviceWorker?.addEventListener('message', (e) => {
  const { type, payload = {} } = e.data || {};
  if (type !== 'push') return;
  if (payload.tag?.startsWith('report-')) showCarAlert(payload);
  else if (payload.tag?.startsWith('parking-')) showParkingReminder(payload);
  else if (payload.type === 'park_prompt') showParkPrompt(payload);
  else if (payload.type === 'access_request') onAccessRequest(payload);
  else if (payload.type === 'access_granted') window.dispatchEvent(new Event('pc:access'));
  else if (payload.type === 'announcement') showAnnouncement(payload);
});
