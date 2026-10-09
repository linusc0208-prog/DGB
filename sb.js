// Verbindung zu Supabase + Umwandlung der Datenbank-Zeilen in das Format der App.
import { KIND } from './ui.js';

export const cfg = window.PARKRADAR_CONFIG || {};

if (!cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase) {
  document.body.innerHTML = `<div style="font-family:system-ui;padding:32px;max-width:520px;margin:auto">
    <h2>ParkCheck ist noch nicht verbunden</h2>
    <p>Es fehlen die Supabase-Zugangsdaten. Trage <b>SUPABASE_URL</b> und <b>SUPABASE_PUBLISHABLE_KEY</b>
    bei Vercel unter <i>Settings → Environment Variables</i> ein (lokal: in der Datei <code>.env</code>) und veröffentliche neu.</p></div>`;
  throw new Error('Supabase-Konfiguration fehlt');
}

export const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export class AppError extends Error {}

let accessToken = null;
export const setAccessToken = (t) => { accessToken = t || null; };
export const getAccessToken = () => accessToken;

/** Fehlermeldungen von Supabase in verständliches Deutsch übersetzen */
export function friendly(error) {
  const msg = error?.message || String(error || '');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Keine Verbindung. Bist du online?';
  if (/Invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort ist falsch.';
  if (/Email not confirmed/i.test(msg)) return 'Bitte bestätige zuerst deine E-Mail-Adresse – der Link ist in deinem Postfach.';
  if (/already registered|already been registered/i.test(msg)) return 'Diese E-Mail ist schon registriert.';
  if (/Password should be at least/i.test(msg)) return 'Das Passwort ist zu kurz.';
  if (/rate limit|too many/i.test(msg)) return 'Zu viele Versuche – bitte in ein paar Minuten erneut.';
  if (/JWT|not authenticated/i.test(msg)) return 'Bitte melde dich erneut an.';
  if (/Unable to validate email|invalid format/i.test(msg)) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
  return msg || 'Unbekannter Fehler';
}

/** Datenbank-Funktion aufrufen; wirft AppError mit deutscher Meldung */
export async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new AppError(friendly(error));
  return data;
}

// ---------- Umwandlung ----------
const ts = (v) => (v ? Date.parse(v) : null);

/** Wie verlässlich ist eine Meldung? 0–100 (gleiche Formel wie früher auf dem Server) */
export function confidence(r, t = Date.now()) {
  const sinceActivity = (t - r.updatedAt) / 60000;
  const rep = Math.max(-20, Math.min(60, r.authorRep ?? 0));
  const s = 55 + rep * 0.3 + r.confirms * 13 - r.gones * 20 - sinceActivity * 1.2;
  return Math.max(10, Math.min(99, Math.round(s)));
}

/** Zeile aus RPC oder Realtime → Meldung; prev behält isMine/myVote, die Realtime nicht kennt */
export function toReport(row, prev) {
  const r = {
    id: Number(row.id),
    lat: row.lat,
    lng: row.lng,
    street: row.street ?? null,
    kind: row.kind,
    kindLabel: (KIND[row.kind] || KIND.patrol).label.replace(/­/g, ''),
    confirms: row.confirms,
    gones: row.gones,
    status: row.status,
    createdAt: ts(row.created_at),
    updatedAt: ts(row.updated_at),
    expiresAt: ts(row.expires_at),
    authorRep: row.author_rep ?? prev?.authorRep ?? 0,
    isMine: row.is_mine ?? prev?.isMine ?? false,
    myVote: row.my_vote !== undefined ? row.my_vote : (prev?.myVote ?? null),
  };
  r.confidence = confidence(r);
  r.canEdit = r.isMine && Date.now() - r.createdAt < 5 * 60_000;
  return r;
}

export const toCar = (c) => (c ? { lat: c.lat, lng: c.lng, street: c.street, parkedAt: ts(c.parked_at) } : null);

export const toSession = (s) => (s && s.status === 'active'
  ? { id: Number(s.id), status: s.status, startedAt: ts(s.started_at), endsAt: ts(s.ends_at) }
  : null);

export function toUser(profile, authUser) {
  return {
    id: profile.id,
    email: authUser?.email || '',
    name: profile.name || authUser?.user_metadata?.name || '',
    reputation: profile.reputation,
    alertRadius: profile.alert_radius,
    parkReminder: profile.park_reminder !== false,
    autoPark: !!profile.auto_park,
    memberCount: Number(profile.member_count || 0),
    access: profile.access || 'pending',
    isAdmin: !!profile.is_admin,
    accessNote: profile.access_note || '',
    pendingCount: Number(profile.pending_count || 0),
    createdAt: ts(profile.created_at),
    stats: { confirmed: Number(profile.confirmed || 0) },
  };
}
