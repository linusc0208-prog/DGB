// Nachbau der für Don’t get busted relevanten Supabase-Umgebung auf einer echten Postgres-Engine (PGlite),
// damit schema.sql ohne Supabase-Konto getestet werden kann.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(import.meta.dirname, '..');

const BOOTSTRAP = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

create schema extensions;
create schema net;
create table net.calls (id bigserial primary key, url text, body jsonb, headers jsonb, timeout int);
create table net._http_response (id bigint primary key, status_code int, content text);
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
                              headers jsonb default '{}'::jsonb, timeout_milliseconds int default 2000)
returns bigint language sql as $$
  insert into net.calls (url, body, headers, timeout) values (url, body, headers, timeout_milliseconds) returning id
$$;

create schema cron;
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
  select 1::bigint
$$;

create publication supabase_realtime;
`;

export async function createDb({ realtime = false } = {}) {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  let sql = fs.readFileSync(path.join(ROOT, 'supabase/schema.sql'), 'utf8');
  // Erweiterungen gibt es in PGlite nicht – sie sind oben nachgebaut
  sql = sql.replace(/^create extension[^;]*;$/gim, '');
  await db.exec(sql);
  // Das Skript muss sich ein zweites Mal ohne Fehler ausführen lassen
  await db.exec(sql);
  if (realtime) await installRealtimeTriggers(db);
  return db;
}

/** Nachbau von Supabase Realtime: Änderungen per NOTIFY melden */
async function installRealtimeTriggers(db) {
  await db.exec(`
    create or replace function public._rt_notify() returns trigger language plpgsql as $$
    begin
      perform pg_notify('rt', json_build_object('table', tg_table_name, 'type', tg_op,
        'new', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
        'old', case when tg_op = 'INSERT' then null else to_jsonb(old) end)::text);
      return null;
    end $$;
    create trigger rt_reports after insert or update or delete on public.reports for each row execute function public._rt_notify();
    create trigger rt_outbox after insert on public.outbox for each row execute function public._rt_notify();
    create trigger rt_parking after insert or update on public.parking_sessions for each row execute function public._rt_notify();
  `);
}

/** Wie ein eingeloggter Nutzer (Rolle authenticated + JWT-Claims) ausführen */
export async function asUser(db, uid, query, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await tx.exec('set local role authenticated');
    return tx.query(query, params);
  });
}

/** RPC wie supabase.rpc(name, args) */
export async function rpc(db, uid, name, args = {}) {
  const keys = Object.keys(args);
  const list = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const res = await asUser(db, uid, `select public.${name}(${list}) as data`, keys.map((k) => args[k]));
  return res.rows[0]?.data ?? null;
}

export async function signUp(db, email, name) {
  const id = crypto.randomUUID();
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify({ name })]);
  return id;
}

/** Zeit vordrehen: alle Zeitstempel um X Minuten in die Vergangenheit schieben */
export async function ageMinutes(db, minutes) {
  const iv = `${minutes} minutes`;
  await db.query(`update public.reports set created_at = created_at - $1::interval, updated_at = updated_at - $1::interval, expires_at = expires_at - $1::interval`, [iv]);
  await db.query(`update public.parking_sessions set started_at = started_at - $1::interval, ends_at = ends_at - $1::interval`, [iv]);
}
