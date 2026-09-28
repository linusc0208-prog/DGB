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
  assert.match(out.rows[0].payload.title, /Fußstreife ca\. 220 m von deinem Auto/);
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
