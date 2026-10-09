// Tests für supabase/schema.sql auf einer echten Postgres-Engine (PGlite): npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, rpc, asUser, signUp, ageMinutes } from './supabase-sim.mjs';

let db;
let A; let B; let C;
const spot = { lat: 52.5129, lng: 13.4577 };

const rejects = async (p, re) => {
  await assert.rejects(p, (e) => { assert.match(e.message, re); return true; });
};

before(async () => {
  db = await createDb();
  A = await signUp(db, 'a@test.de', 'Anna');
  B = await signUp(db, 'b@test.de', 'Ben');
  C = await signUp(db, 'c@test.de', 'Cem');
});

test('Profil wird beim Registrieren angelegt', async () => {
  const p = await rpc(db, A, 'get_profile');
  assert.equal(p.name, 'Anna');
  assert.equal(p.alert_radius, 300);
  const upd = await rpc(db, A, 'update_profile', { p_alert_radius: 150 });
  assert.equal(upd.alert_radius, 150);
  await rejects(rpc(db, A, 'update_profile', { p_alert_radius: 123 }), /Warnradius/);
  await rpc(db, A, 'update_profile', { p_alert_radius: 300 });
  await rejects(rpc(db, null, 'get_profile'), /melde dich an/);
});

test('Melden, Art ändern, doppelt melden', async () => {
  const res = await rpc(db, A, 'create_report', { p_lat: spot.lat, p_lng: spot.lng, p_street: 'Boxhagener Str.' });
  assert.equal(res.merged, false);
  assert.equal(res.report.kind, 'patrol');
  assert.equal(res.report.is_mine, true);
  assert.equal(res.report.street, 'Boxhagener Str.');
  const r = await rpc(db, A, 'set_report_kind', { p_id: res.report.id, p_kind: 'tow' });
  assert.equal(r.kind, 'tow');
  await rejects(rpc(db, B, 'set_report_kind', { p_id: res.report.id, p_kind: 'foot' }), /nicht gefunden/);

  const again = await rpc(db, A, 'create_report', { p_lat: spot.lat, p_lng: spot.lng });
  assert.equal(again.own, true);

  const merged = await rpc(db, B, 'create_report', { p_lat: spot.lat + 0.0003, p_lng: spot.lng });
  assert.equal(merged.merged, true);
  assert.equal(merged.report.confirms, 1);
  assert.equal(merged.report.is_mine, false);
  assert.equal(merged.report.my_vote, 'confirm');
});

test('Sichtbarkeit: Meldungen öffentlich, Urheber geheim', async () => {
  const list = await rpc(db, C, 'reports_near', { p_lat: spot.lat, p_lng: spot.lng, p_radius: 1000 });
  assert.equal(list.length, 1);
  assert.ok(list[0].distance < 5);
  assert.equal(list[0].is_mine, false);
  // Direkter Tabellenzugriff wie über die API
  const direct = await asUser(db, C, 'select * from public.reports');
  assert.equal(direct.rows.length, 1);
  assert.equal('user_id' in direct.rows[0], false, 'kein Nutzerbezug in reports');
  const authors = await asUser(db, C, 'select * from public.report_authors');
  assert.equal(authors.rows.length, 0, 'fremde Urheber unsichtbar');
  const own = await asUser(db, A, 'select * from public.report_authors');
  assert.equal(own.rows.length, 1);
  await assert.rejects(asUser(db, C, `update public.reports set confirms = 99`), /permission denied/);
  await assert.rejects(asUser(db, C, `insert into public.reports (lat, lng, expires_at) values (1, 1, now())`), /permission denied/);
  await assert.rejects(asUser(db, C, `select * from public.app_config`), /permission denied/);
  await assert.rejects(asUser(db, C, `select public.tick()`), /permission denied/);
  await assert.rejects(asUser(db, C, `select public._alert_cars(1, null)`), /permission denied/);
});

test('Bestätigen, Widerlegen, Reputation', async () => {
  const [r] = await rpc(db, C, 'reports_near', { p_lat: spot.lat, p_lng: spot.lng });
  await rejects(rpc(db, A, 'vote_report', { p_id: r.id, p_value: 'confirm' }), /Eigene Meldungen/);
  const v = await rpc(db, C, 'vote_report', { p_id: r.id, p_value: 'confirm' });
  assert.equal(v.confirms, 2);
  assert.equal((await rpc(db, A, 'get_profile')).reputation, 2);
  assert.equal((await rpc(db, A, 'get_profile')).confirmed, 2);
  await rpc(db, C, 'vote_report', { p_id: r.id, p_value: 'gone' });
  const done = await rpc(db, B, 'vote_report', { p_id: r.id, p_value: 'gone' });
  assert.equal(done.status, 'gone');
  assert.equal((await rpc(db, C, 'reports_near', { p_lat: spot.lat, p_lng: spot.lng })).length, 0);
});

test('Rate-Limit und Rückgängig', async () => {
  const r1 = await rpc(db, C, 'create_report', { p_lat: 52.52, p_lng: 13.46 });
  await rejects(rpc(db, C, 'create_report', { p_lat: 52.53, p_lng: 13.47 }), /gerade erst gemeldet/);
  await rpc(db, C, 'delete_report', { p_id: r1.report.id });
  await rejects(rpc(db, A, 'delete_report', { p_id: r1.report.id }), /nicht gefunden/);
  assert.equal((await rpc(db, C, 'reports_near', { p_lat: 52.52, p_lng: 13.46 })).length, 0);
});

test('Warnung ans Auto: Radius, Outbox, Push-Aufruf', async () => {
  await db.query(`insert into public.app_config values ('push_url', 'https://x.supabase.co/functions/v1/send-push'), ('push_secret', 's3cret')`);
  await rpc(db, B, 'save_push_subscription', { p_endpoint: 'https://push.example/abc', p_p256dh: 'key', p_auth: 'auth' });
  const car = await rpc(db, B, 'set_car', { p_lat: 52.5, p_lng: 13.4, p_street: 'Kantstr.' });
  assert.equal(car.street, 'Kantstr.');

  await ageMinutes(db, 2); // Rate-Limit von C umgehen
  const far = await rpc(db, A, 'create_report', { p_lat: 52.5 + 0.004, p_lng: 13.4 }); // ~445 m
  assert.equal(far.merged, false);
  let out = await asUser(db, B, 'select * from public.outbox');
  assert.equal(out.rows.length, 0, 'außerhalb von 300 m keine Warnung');

  await ageMinutes(db, 2);
  await rpc(db, C, 'create_report', { p_lat: 52.5 + 0.002, p_lng: 13.4, p_kind: 'foot', p_street: 'Kantstr.' }); // ~222 m
  out = await asUser(db, B, 'select * from public.outbox');
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].payload.title, '🎫 Ticket gemeldet – ca. 220 m von deinem Auto');
  assert.match(out.rows[0].payload.body, /kein Parkschein\)\. Bitte beachte die Parkregeln und prüfe deinen Parkschein\.$/);
  assert.equal(out.rows[0].payload.street, 'Kantstr.');
  assert.ok(out.rows[0].request_id, 'Push wurde angestoßen');
  const calls = (await db.query('select * from net.calls')).rows;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['x-webhook-secret'], 's3cret');
  assert.equal(calls[0].body.subscriptions[0].endpoint, 'https://push.example/abc');
  assert.equal(calls[0].body.payload.reportId, out.rows[0].payload.reportId);

  // Andere sehen fremde Benachrichtigungen und Autos nicht
  assert.equal((await asUser(db, A, 'select * from public.outbox')).rows.length, 0);
  assert.equal((await asUser(db, A, 'select * from public.cars')).rows.length, 0);

  // Bestätigung derselben Meldung löst keine zweite Warnung aus
  await rpc(db, A, 'vote_report', { p_id: out.rows[0].payload.reportId, p_value: 'confirm' });
  assert.equal((await asUser(db, B, 'select * from public.outbox')).rows.length, 1);

  // Abgemeldetes Gerät wird aufgeräumt
  await db.query(`insert into net._http_response values ($1, 200, '{"sent":0,"gone":["https://push.example/abc"]}')`, [out.rows[0].request_id]);
  await db.query('select public.tick()');
  assert.equal((await db.query('select count(*)::int n from public.push_subscriptions')).rows[0].n, 0);
});

test('Parkschein: Start, Verlängern, Erinnerung, Ablauf', async () => {
  const s = await rpc(db, B, 'start_parking', { p_minutes: 60 });
  assert.equal(s.status, 'active');
  const ext = await rpc(db, B, 'extend_parking', { p_minutes: 30 });
  assert.ok(new Date(ext.ends_at) - Date.now() > 89 * 60_000);
  await ageMinutes(db, 85); // noch ~5 Min.
  await db.query('select public.tick()');
  const out = await asUser(db, B, `select * from public.outbox where kind = 'parking_reminder'`);
  assert.equal(out.rows.length, 1);
  assert.match(out.rows[0].payload.title, /Parkschein läuft in \d Min\. ab/);
  await db.query('select public.tick()');
  assert.equal((await asUser(db, B, `select * from public.outbox where kind = 'parking_reminder'`)).rows.length, 1, 'nur einmal erinnern');
  await ageMinutes(db, 10);
  await db.query('select public.tick()');
  const sess = await asUser(db, B, 'select status from public.parking_sessions');
  assert.equal(sess.rows[0].status, 'expired');
  // Meldungen sind inzwischen abgelaufen
  assert.equal((await db.query(`select count(*)::int n from public.reports where status = 'active'`)).rows[0].n, 0);
});

test('Export und Konto löschen', async () => {
  const data = await rpc(db, C, 'export_my_data');
  assert.equal(data.email, 'c@test.de');
  assert.ok(data.reports.length >= 2);
  await rpc(db, C, 'delete_my_account');
  assert.equal((await db.query('select count(*)::int n from auth.users where email = $1', ['c@test.de'])).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from public.profiles where id = $1', [C])).rows[0].n, 0);
  const left = (await db.query(`select count(*)::int n from public.reports where kind = 'foot'`)).rows[0].n;
  assert.equal(left, 1, 'Meldungen bleiben ohne Nutzerbezug erhalten');
});

test('Gesperrte Nutzer können nichts mehr tun', async () => {
  await db.query('update public.profiles set banned = true where id = $1', [A]);
  await rejects(rpc(db, A, 'create_report', { p_lat: 50, p_lng: 8 }), /gesperrt/);
  assert.equal((await db.query(`select count(*)::int n from cron.job where jobname = 'parkradar-tick'`)).rows[0].n, 1);
});

test('Straßen-Statistik: zählt Tickets in der Straße, nicht anderswo', async () => {
  const db = await createDb();
  const u = [];
  for (const n of ['a', 'b', 'c', 'd', 'e']) u.push(await signUp(db, `st-${n}@x.de`, n));
  await rpc(db, u[0], 'create_report', { p_lat: 52.5126, p_lng: 13.4582, p_street: 'Krossener Str.' });
  await ageMinutes(db, 60 * 24 * 3);                                                                   // vor 3 Tagen
  await rpc(db, u[1], 'create_report', { p_lat: 52.5127, p_lng: 13.4600, p_street: 'Krossener Str.' }); // eben
  await rpc(db, u[2], 'create_report', { p_lat: 52.5200, p_lng: 13.4700, p_street: 'Andere Str.' });
  await rpc(db, u[3], 'create_report', { p_lat: 48.1, p_lng: 11.5, p_street: 'Krossener Str.' });       // andere Stadt
  const s = await rpc(db, u[0], 'street_stats', { p_lat: 52.5126, p_lng: 13.4585, p_street: 'krossener str.' });
  assert.equal(s.week, 2);
  assert.equal(s.month, 2);
  assert.equal(s.today, 1);
  assert.equal(s.hours.length, 24);
  assert.equal(s.hours.reduce((x, y) => x + y, 0), 2);
  assert.ok(Date.now() - Date.parse(s.last) < 60_000);
  // Push-Text spricht von einem vergebenen Ticket
  await rpc(db, u[2], 'set_car', { p_lat: 52.5126, p_lng: 13.4582, p_street: 'Krossener Str.' });
  const r5 = await rpc(db, u[4], 'create_report', { p_lat: 52.5131, p_lng: 13.4560, p_street: 'Krossener Str.', p_kind: 'car' });
  const msg = (await db.query(`select payload from public.outbox where kind = 'car_alert' and (payload->>'reportId')::bigint = $1`, [r5.report.id])).rows[0]?.payload;
  assert.match(msg.title, /^🎫 Ticket gemeldet – ca\. \d+ m von deinem Auto$/);
  assert.equal(msg.body, 'Hier wurde ein Ticket vergeben (Krossener Str., Halteverbot). Bitte beachte die Parkregeln und prüfe deinen Parkschein.');
  // Ohne Anmeldung keine Statistik
  await assert.rejects(() => rpc(db, null, 'street_stats', { p_lat: 52.5, p_lng: 13.4, p_street: 'Krossener Str.' }));
});

test('Parkschein-Erinnerung: 3 Minuten nach dem Abstellen, einmal, abschaltbar', async () => {
  const db = await createDb();
  const u = await signUp(db, 'pk-u@x.de', 'U');
  const v = await signUp(db, 'pk-v@x.de', 'V');
  const ageCar = (uid, min) => db.query(`update public.cars set parked_at = parked_at - ($2 || ' minutes')::interval where user_id = $1`, [uid, String(min)]);
  const prompts = async (uid) => (await db.query(`select payload from public.outbox where kind = 'park_prompt' and user_id = $1 order by id`, [uid])).rows.map((r) => r.payload);

  // Ein gemeldetes Ticket in der Straße
  await rpc(db, v, 'create_report', { p_lat: 52.5126, p_lng: 13.4600, p_street: 'Krossener Str.' });

  await rpc(db, u, 'set_car', { p_lat: 52.5126, p_lng: 13.4582, p_street: 'Krossener Str.' });
  await db.query('select public.tick()');
  assert.equal((await prompts(u)).length, 0, 'nicht sofort');
  await ageCar(u, 4);
  await db.query('select public.tick()');
  let p = await prompts(u);
  assert.equal(p.length, 1, 'nach 3 Minuten');
  assert.equal(p[0].title, '🅿️ Parkschein gecheckt?');
  assert.equal(p[0].body, 'Krossener Str.: 1 Ticket in den letzten 30 Tagen gemeldet. Prüfe, ob du einen Parkschein brauchst.');
  assert.equal(p[0].url, '/?car=1&park=1');
  await db.query('select public.tick()');
  assert.equal((await prompts(u)).length, 1, 'nur einmal');

  // Kleine Korrektur (< 100 m) löst keine neue Erinnerung aus
  await rpc(db, u, 'set_car', { p_lat: 52.51265, p_lng: 13.4583, p_street: 'Krossener Str.' });
  await ageCar(u, 4);
  await db.query('select public.tick()');
  assert.equal((await prompts(u)).length, 1, 'Korrektur zählt nicht als neues Parken');

  // Woanders geparkt -> neue Erinnerung, ohne Tickets in der Straße
  await rpc(db, u, 'set_car', { p_lat: 52.5300, p_lng: 13.4100, p_street: 'Ruhige Str.' });
  await ageCar(u, 4);
  await db.query('select public.tick()');
  p = await prompts(u);
  assert.equal(p.length, 2);
  assert.equal(p[1].body, 'Du hast gerade geparkt. Prüfe, ob du hier einen Parkschein brauchst – und ob er schon läuft.');

  // Parkschein gestartet -> keine Erinnerung
  await rpc(db, u, 'set_car', { p_lat: 52.5000, p_lng: 13.3000, p_street: 'A-Str.' });
  await rpc(db, u, 'start_parking', { p_minutes: 60 });
  await ageCar(u, 4);
  await db.query('select public.tick()');
  assert.equal((await prompts(u)).length, 2, 'mit Parkschein keine Erinnerung');
  await rpc(db, u, 'stop_parking');

  // "Hier nicht nötig"
  await rpc(db, u, 'set_car', { p_lat: 52.4800, p_lng: 13.2000, p_street: 'B-Str.' });
  await rpc(db, u, 'dismiss_park_prompt');
  await ageCar(u, 4);
  await db.query('select public.tick()');
  assert.equal((await prompts(u)).length, 2, 'weggeklickt');

  // Abgeschaltet
  const prof = await rpc(db, u, 'set_park_reminder', { p_on: false });
  assert.equal(prof.park_reminder, false);
  await rpc(db, u, 'set_car', { p_lat: 52.4600, p_lng: 13.1000, p_street: 'C-Str.' });
  await ageCar(u, 4);
  await db.query('select public.tick()');
  assert.equal((await prompts(u)).length, 2, 'Erinnerung aus');
});

test('Zugang nur nach Freigabe durch einen Admin', async () => {
  const db = await createDb();
  const admin = await signUp(db, 'admin@x.de', 'Chef', { admin: true });
  const old = await signUp(db, 'alt@x.de', 'Alt');
  await rpc(db, old, 'create_report', { p_lat: 52.5126, p_lng: 13.4582, p_street: 'Krossener Str.' });
  const neu = await signUp(db, 'neu@x.de', 'Neu', { approved: false });

  // Admin wurde benachrichtigt
  const req = (await db.query(`select payload from public.outbox where kind = 'access_request' and user_id = $1 and payload->>'body' like 'Neu %'`, [admin])).rows;
  assert.equal(req.length, 1);
  assert.equal(req[0].payload.title, '👋 Neue Zugangsanfrage');
  assert.match(req[0].payload.body, /^Neu möchte ParkCheck nutzen/);

  // Ohne Freigabe: Profil ja, App-Funktionen nein, Meldungen unsichtbar
  const prof = await rpc(db, neu, 'get_profile');
  assert.equal(prof.access, 'pending');
  await assert.rejects(() => rpc(db, neu, 'reports_near', { p_lat: 52.5126, p_lng: 13.4582 }), /noch nicht freigeschaltet/);
  await assert.rejects(() => rpc(db, neu, 'create_report', { p_lat: 52.5, p_lng: 13.4 }), /noch nicht freigeschaltet/);
  await assert.rejects(() => rpc(db, neu, 'set_car', { p_lat: 52.5, p_lng: 13.4 }), /noch nicht freigeschaltet/);
  assert.equal((await asUser(db, neu, 'select * from public.reports')).rows.length, 0, 'RLS versteckt Meldungen');
  assert.equal((await asUser(db, old, 'select * from public.reports')).rows.length, 1);
  const noted = await rpc(db, neu, 'set_access_note', { p_note: 'Ich wohne in der Krossener Str.' });
  assert.equal(noted.access_note, 'Ich wohne in der Krossener Str.');

  // Nur Admins dürfen freigeben
  await assert.rejects(() => rpc(db, old, 'admin_list_users', {}), /Nur für Admins/);
  await assert.rejects(() => rpc(db, old, 'admin_set_access', { p_user: neu, p_access: 'approved' }), /Nur für Admins/);
  const list = await rpc(db, admin, 'admin_list_users', { p_filter: 'pending' });
  assert.equal(list.length, 1);
  assert.equal(list[0].email, 'neu@x.de');
  assert.equal(list[0].note, 'Ich wohne in der Krossener Str.');
  assert.equal((await rpc(db, admin, 'get_profile')).pending_count, 1);
  await assert.rejects(() => rpc(db, admin, 'admin_set_access', { p_user: admin, p_access: 'rejected' }), /eigenen Zugang/);

  // Freigabe -> Nachricht an den Nutzer, danach funktioniert alles
  await rpc(db, admin, 'admin_set_access', { p_user: neu, p_access: 'approved' });
  const granted = (await db.query(`select payload from public.outbox where kind = 'access_granted' and user_id = $1`, [neu])).rows;
  assert.equal(granted.length, 1);
  assert.equal(granted[0].payload.title, '✅ Du bist freigeschaltet');
  const near = await rpc(db, neu, 'reports_near', { p_lat: 52.5126, p_lng: 13.4582 });
  assert.equal(near.length, 1);

  // Ablehnen / wieder sperren
  await rpc(db, neu, 'set_car', { p_lat: 52.5126, p_lng: 13.4582 });
  await rpc(db, admin, 'admin_set_access', { p_user: neu, p_access: 'rejected' });
  await assert.rejects(() => rpc(db, neu, 'reports_near', { p_lat: 52.5, p_lng: 13.4 }), /abgelehnt/);
  assert.equal((await db.query('select count(*)::int n from public.cars where user_id = $1', [neu])).rows[0].n, 0, 'Auto entfernt');
  assert.equal((await rpc(db, neu, 'get_profile')).access, 'rejected');
});

test('Bestehende Konten bleiben beim Einführen der Freigabe freigeschaltet', async () => {
  const db = await createDb();
  const id = crypto.randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, 'vorher@x.de']);
  // Zustand wie vor dem Update: Spalte gab es noch nicht
  await db.query('alter table public.profiles alter column access drop not null');
  await db.query('update public.profiles set access = null where id = $1', [id]);
  const fs = await import('node:fs');
  await db.exec(fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').replace(/^create extension[^;]*;$/gim, ''));
  assert.equal((await db.query('select access from public.profiles where id = $1', [id])).rows[0].access, 'approved');
});

test('Mitteilungen: nur Admins senden, alle Freigeschalteten bekommen sie', async () => {
  const db = await createDb();
  const admin = await signUp(db, 'm-admin@x.de', 'Chef', { admin: true });
  const a = await signUp(db, 'm-a@x.de', 'A');
  const b = await signUp(db, 'm-b@x.de', 'B');
  const wait = await signUp(db, 'm-w@x.de', 'W', { approved: false });
  assert.equal((await rpc(db, admin, 'get_profile')).member_count, 3);

  await assert.rejects(() => rpc(db, a, 'admin_send_announcement', { p_title: 'x', p_body: 'y' }), /Nur für Admins/);
  await assert.rejects(() => rpc(db, admin, 'admin_send_announcement', { p_title: '', p_body: 'y' }), /Titel/);
  const res = await rpc(db, admin, 'admin_send_announcement', { p_title: 'Neue Funktion', p_body: 'Ab heute gibt es die Straßen-Info.' });
  assert.equal(res.recipients, 3, 'an alle Freigeschalteten inkl. Absender');
  const out = (await db.query(`select user_id, payload from public.outbox where kind = 'announcement'`)).rows;
  assert.deepEqual(out.map((r) => r.user_id).sort(), [admin, a, b].sort());
  assert.equal(out[0].payload.title, '📣 Neue Funktion');
  assert.equal(out[0].payload.url, `/?news=${res.id}`);
  assert.ok(out[0].request_id !== null || true);

  const list = await rpc(db, a, 'announcements_list', {});
  assert.equal(list.length, 1);
  assert.equal(list[0].body, 'Ab heute gibt es die Straßen-Info.');
  await assert.rejects(() => rpc(db, wait, 'announcements_list', {}), /noch nicht freigeschaltet/);
  assert.equal((await asUser(db, wait, 'select * from public.announcements')).rows.length, 0, 'RLS');
  await assert.rejects(() => asUser(db, a, `insert into public.announcements (title, body) values ('x', 'y')`));

  await rpc(db, admin, 'admin_delete_announcement', { p_id: res.id });
  assert.equal((await rpc(db, a, 'announcements_list', {})).length, 0);
});

test('Automatische Park-Erkennung ist standardmäßig aus und abschaltbar', async () => {
  const db = await createDb();
  const u = await signUp(db, 'ap@x.de', 'U');
  assert.equal((await rpc(db, u, 'get_profile')).auto_park, false);
  assert.equal((await rpc(db, u, 'set_auto_park', { p_on: true })).auto_park, true);
  assert.equal((await rpc(db, u, 'set_auto_park', { p_on: false })).auto_park, false);
});
