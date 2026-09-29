-- =====================================================================
--  ParkCheck – Datenbank für Supabase
--  Komplett in den SQL Editor kopieren und auf "Run" klicken.
--  Das Skript kann gefahrlos mehrmals ausgeführt werden (z. B. nach Updates).
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
--  Tabellen
-- ---------------------------------------------------------------------

-- Profil pro Nutzer (Login selbst übernimmt Supabase Auth)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null default '' check (char_length(name) <= 40),
  reputation    int  not null default 0,
  alert_radius  int  not null default 300 check (alert_radius in (150, 300, 500)),
  banned        boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Meldungen – enthalten bewusst keinen Nutzerbezug und sind für alle sichtbar
create table if not exists public.reports (
  id             bigint generated always as identity primary key,
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  street         text check (char_length(street) <= 60),
  kind           text not null default 'patrol' check (kind in ('patrol', 'foot', 'car', 'tow')),
  confirms       int  not null default 0,
  gones          int  not null default 0,
  peak_confirms  int  not null default 0,
  author_rep     int  not null default 0,
  status         text not null default 'active' check (status in ('active', 'gone', 'expired', 'removed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  expires_at     timestamptz not null
);
create index if not exists reports_active_idx on public.reports (status, expires_at);
create index if not exists reports_geo_idx    on public.reports (lat, lng);

-- Wer hat was gemeldet (nur für den Meldenden selbst lesbar)
create table if not exists public.report_authors (
  report_id  bigint primary key references public.reports(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade
);
create index if not exists report_authors_user_idx on public.report_authors (user_id);

create table if not exists public.votes (
  report_id   bigint not null references public.reports(id) on delete cascade,
  user_id     uuid   not null references auth.users(id) on delete cascade,
  value       smallint not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table if not exists public.cars (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  street     text,
  parked_at  timestamptz not null default now()
);

create table if not exists public.car_alerts (
  user_id     uuid   not null references auth.users(id) on delete cascade,
  report_id   bigint not null references public.reports(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, report_id)
);

create table if not exists public.parking_sessions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  provider    text not null default 'easypark',
  status      text not null check (status in ('active', 'stopped', 'expired')),
  reminded    boolean not null default false,
  started_at  timestamptz not null default now(),
  ends_at     timestamptz not null,
  stopped_at  timestamptz
);
create index if not exists parking_active_idx on public.parking_sessions (status, ends_at);

create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- Benachrichtigungen: landen live in der App (Realtime) und als Push aufs Handy
create table if not exists public.outbox (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  payload     jsonb not null,
  request_id  bigint,
  created_at  timestamptz not null default now()
);
create index if not exists outbox_user_idx on public.outbox (user_id, created_at);

-- Interne Einstellungen (Push-Adresse und Geheimwert) – für Nutzer unsichtbar
create table if not exists public.app_config (
  key    text primary key,
  value  text not null
);

-- ---------------------------------------------------------------------
--  Zugriffsregeln (Row Level Security)
--  Lesen: nur eigene Daten (Meldungen sind öffentlich).
--  Schreiben: ausschließlich über die Funktionen weiter unten.
-- ---------------------------------------------------------------------
-- Erinnerung beim Parken (nachträglich ergänzt, deshalb als eigene Spalten)
alter table public.profiles add column if not exists park_reminder  boolean not null default true;
alter table public.cars     add column if not exists park_prompt_at timestamptz;

-- Zugang nur nach Freigabe. Wer beim Einführen schon ein Konto hatte, bleibt freigeschaltet.
alter table public.profiles add column if not exists access text;
update public.profiles set access = 'approved' where access is null;
alter table public.profiles alter column access set default 'pending';
alter table public.profiles alter column access set not null;
alter table public.profiles drop constraint if exists profiles_access_check;
alter table public.profiles add constraint profiles_access_check check (access in ('pending', 'approved', 'rejected'));
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists access_note text;
alter table public.profiles add column if not exists access_changed_at timestamptz;
alter table public.profiles drop constraint if exists profiles_access_note_check;
alter table public.profiles add constraint profiles_access_note_check check (char_length(access_note) <= 300);

-- Ist der angemeldete Nutzer freigeschaltet? (für die Zugriffsregeln)
create or replace function public._approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and access = 'approved' and not banned)
$$;

alter table public.profiles           enable row level security;
alter table public.reports            enable row level security;
alter table public.report_authors     enable row level security;
alter table public.votes              enable row level security;
alter table public.cars               enable row level security;
alter table public.car_alerts         enable row level security;
alter table public.parking_sessions   enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.outbox             enable row level security;
alter table public.app_config         enable row level security;

drop policy if exists "eigenes Profil lesen" on public.profiles;
create policy "eigenes Profil lesen" on public.profiles for select to authenticated using (id = auth.uid());

drop policy if exists "Meldungen lesen" on public.reports;
create policy "Meldungen lesen" on public.reports for select to authenticated using (public._approved());

drop policy if exists "eigene Meldungen erkennen" on public.report_authors;
create policy "eigene Meldungen erkennen" on public.report_authors for select to authenticated using (user_id = auth.uid());

drop policy if exists "eigene Stimmen lesen" on public.votes;
create policy "eigene Stimmen lesen" on public.votes for select to authenticated using (user_id = auth.uid());

drop policy if exists "eigenes Auto lesen" on public.cars;
create policy "eigenes Auto lesen" on public.cars for select to authenticated using (user_id = auth.uid());

drop policy if exists "eigene Parkscheine lesen" on public.parking_sessions;
create policy "eigene Parkscheine lesen" on public.parking_sessions for select to authenticated using (user_id = auth.uid());

drop policy if exists "eigene Push-Abos lesen" on public.push_subscriptions;
create policy "eigene Push-Abos lesen" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());

drop policy if exists "eigene Benachrichtigungen lesen" on public.outbox;
create policy "eigene Benachrichtigungen lesen" on public.outbox for select to authenticated using (user_id = auth.uid());

revoke all on public.app_config from anon, authenticated;
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
--  Hilfsfunktionen (intern)
-- ---------------------------------------------------------------------

-- Entfernung in Metern zwischen zwei Koordinaten
create or replace function public._dist_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

-- Angemeldeten Nutzer holen, sonst Fehler (auch ohne Freigabe – für Profil, Anfrage, Datenschutz)
create or replace function public._me_any()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Bitte melde dich an.' using errcode = '28000';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then
    insert into public.profiles (id) values (auth.uid()) returning * into p;
  end if;
  if p.banned then
    raise exception 'Dein Konto wurde gesperrt.' using errcode = '42501';
  end if;
  return p;
end $$;

-- Angemeldeter und freigeschalteter Nutzer – Voraussetzung für alle App-Funktionen
create or replace function public._me()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles := public._me_any();
begin
  if p.access = 'rejected' then
    raise exception 'Deine Anfrage wurde leider abgelehnt.' using errcode = '42501';
  elsif p.access <> 'approved' then
    raise exception 'Dein Zugang ist noch nicht freigeschaltet.' using errcode = '42501';
  end if;
  return p;
end $$;

-- Nur für Admins
create or replace function public._admin()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles := public._me();
begin
  if not p.is_admin then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  return p;
end $$;

-- Eine Meldung so, wie die App sie braucht
create or replace function public._report_json(r public.reports, uid uuid, olat float8 default null, olng float8 default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'lat', r.lat, 'lng', r.lng, 'street', r.street, 'kind', r.kind,
    'confirms', r.confirms, 'gones', r.gones, 'status', r.status, 'author_rep', r.author_rep,
    'created_at', r.created_at, 'updated_at', r.updated_at, 'expires_at', r.expires_at,
    'is_mine', exists (select 1 from public.report_authors a where a.report_id = r.id and a.user_id = uid),
    'my_vote', (select case v.value when 1 then 'confirm' when -1 then 'gone' end
                from public.votes v where v.report_id = r.id and v.user_id = uid),
    'distance', case when olat is null then null else round(public._dist_m(olat, olng, r.lat, r.lng)) end
  )
$$;

-- Straßenname säubern (kommt vom Gerät)
create or replace function public._clean_street(s text)
returns text language sql immutable as $$
  select nullif(left(btrim(regexp_replace(coalesce(s, ''), '[[:cntrl:]<>]', '', 'g')), 60), '')
$$;

-- Autobesitzer im Warnradius benachrichtigen (je Meldung nur einmal)
create or replace function public._alert_cars(p_report_id bigint, p_actor uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
  author uuid;
  c record;
  d float8;
  n int := 0;
  label text;
begin
  select * into r from public.reports where id = p_report_id;
  if not found or r.status <> 'active' then return 0; end if;
  select user_id into author from public.report_authors where report_id = r.id;
  -- Hinweis-Text: Es wird gemeldet, dass hier ein Ticket vergeben wurde
  label := case r.kind when 'foot' then 'kein Parkschein' when 'car' then 'Halteverbot' else null end;
  for c in
    select cars.*, p.alert_radius from public.cars
    join public.profiles p on p.id = cars.user_id
    where cars.parked_at > now() - interval '24 hours'
      and not p.banned and p.access = 'approved'
      and cars.user_id is distinct from author
      and cars.user_id is distinct from p_actor
      and cars.lat between r.lat - 0.006 and r.lat + 0.006
      and cars.lng between r.lng - 0.01 and r.lng + 0.01
  loop
    d := public._dist_m(c.lat, c.lng, r.lat, r.lng);
    continue when d > c.alert_radius;
    insert into public.car_alerts (user_id, report_id) values (c.user_id, r.id) on conflict do nothing;
    continue when not found;
    insert into public.outbox (user_id, kind, payload) values (c.user_id, 'car_alert', jsonb_build_object(
      'title', '🎫 ' || case when r.kind = 'tow' then 'Abschleppen' else 'Ticket' end || ' gemeldet – ca. '
               || greatest(10, round(d / 10) * 10)::int || ' m von deinem Auto',
      'body', 'Hier wurde ' || case when r.kind = 'tow' then 'ein Auto abgeschleppt' else 'ein Ticket vergeben' end
               || coalesce(' (' || r.street || coalesce(', ' || label, '') || ')', coalesce(' (' || label || ')', ''))
               || '. Bitte beachte die Parkregeln und prüfe deinen Parkschein.',
      'tag', 'report-' || r.id,
      'url', '/?report=' || r.id,
      'reportId', r.id,
      'street', r.street,
      'distance', round(d)));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Stimme verbuchen: bestätigen verlängert, zwei "weg" beenden die Meldung
create or replace function public._apply_vote(p_report_id bigint, p_uid uuid, p_value int)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.reports;
  old_value int;
  author uuid;
  v_confirms int; v_gones int; v_status text; v_expires timestamptz; v_updated timestamptz;
begin
  select * into r from public.reports where id = p_report_id for update;
  select value into old_value from public.votes where report_id = r.id and user_id = p_uid;
  if old_value = p_value then return; end if;
  select user_id into author from public.report_authors where report_id = r.id;

  v_confirms := r.confirms; v_gones := r.gones; v_status := r.status;
  v_expires := r.expires_at; v_updated := r.updated_at;

  if old_value is not null then
    if old_value = 1 then v_confirms := v_confirms - 1; else v_gones := v_gones - 1; end if;
    update public.votes set value = p_value, created_at = now() where report_id = r.id and user_id = p_uid;
  else
    insert into public.votes (report_id, user_id, value) values (r.id, p_uid, p_value);
  end if;

  if p_value = 1 then
    v_confirms := v_confirms + 1;
    v_updated := now();
    -- jede Bestätigung: sichtbar bis jetzt + 15 Min., höchstens 60 Min. ab Meldung
    v_expires := least(r.created_at + interval '60 minutes', greatest(v_expires, now() + interval '15 minutes'));
    if old_value is null and author is not null then
      update public.profiles set reputation = reputation + 1 where id = author;
    end if;
  else
    v_gones := v_gones + 1;
    if v_gones >= 2 and v_gones >= v_confirms then
      v_status := 'gone';
      -- schnell widerlegt und nie bestätigt: vermutlich Falschmeldung
      if r.peak_confirms = 0 and now() - r.created_at < interval '5 minutes' and author is not null then
        update public.profiles set reputation = reputation - 3 where id = author;
      end if;
    end if;
  end if;

  update public.reports
     set confirms = v_confirms, gones = v_gones, status = v_status, expires_at = v_expires,
         updated_at = v_updated, peak_confirms = greatest(peak_confirms, v_confirms)
   where id = r.id;
end $$;

-- ---------------------------------------------------------------------
--  Funktionen, die die App aufruft
-- ---------------------------------------------------------------------

-- Aktive Meldungen im Umkreis
create or replace function public.reports_near(p_lat float8, p_lng float8, p_radius int default 3000)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rad int := least(greatest(coalesce(p_radius, 3000), 100), 25000);
  dlat float8 := rad / 111320.0;
  dlng float8 := rad / (111320.0 * greatest(cos(radians(p_lat)), 0.01));
  result jsonb;
begin
  perform public._me();
  select coalesce(jsonb_agg(j order by (j->>'distance')::float8), '[]'::jsonb) into result
  from (
    select public._report_json(r, auth.uid(), p_lat, p_lng) as j
    from public.reports r
    where r.status = 'active' and r.expires_at > now()
      and r.lat between p_lat - dlat and p_lat + dlat
      and r.lng between p_lng - dlng and p_lng + dlng
      and public._dist_m(p_lat, p_lng, r.lat, r.lng) <= rad
    limit 300
  ) s;
  return result;
end $$;

create or replace function public.report_get(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  perform public._me();
  select * into r from public.reports where id = p_id and status <> 'removed';
  if not found then return null; end if;
  return public._report_json(r, auth.uid());
end $$;

-- Melden mit einem Tipp
create or replace function public.create_report(p_lat float8, p_lng float8, p_kind text default 'patrol', p_street text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  near public.reports;
  near_author uuid;
  r public.reports;
  last_at timestamptz;
  hour_count int;
  kind text := coalesce(nullif(p_kind, ''), 'patrol');
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Standort ist ungültig.' using errcode = '22023';
  end if;
  if kind not in ('patrol', 'foot', 'car', 'tow') then
    raise exception 'Art ist ungültig.' using errcode = '22023';
  end if;

  -- Gibt es hier (75 m, letzte 10 Min.) schon eine Meldung? Dann zählt das als Bestätigung.
  select * into near from public.reports x
   where x.status = 'active' and x.expires_at > now()
     and x.updated_at > now() - interval '10 minutes'
     and x.lat between p_lat - 0.001 and p_lat + 0.001
     and x.lng between p_lng - 0.0016 and p_lng + 0.0016
     and public._dist_m(p_lat, p_lng, x.lat, x.lng) <= 75
   order by public._dist_m(p_lat, p_lng, x.lat, x.lng)
   limit 1;
  if found then
    select user_id into near_author from public.report_authors where report_id = near.id;
    if near_author = me.id then
      return jsonb_build_object('merged', true, 'own', true, 'report', public._report_json(near, me.id, p_lat, p_lng));
    end if;
    perform public._apply_vote(near.id, me.id, 1);
    perform public._alert_cars(near.id, me.id);
    select * into near from public.reports where id = near.id;
    return jsonb_build_object('merged', true, 'report', public._report_json(near, me.id, p_lat, p_lng));
  end if;

  -- Missbrauchsschutz
  select max(r2.created_at), count(*) filter (where r2.created_at > now() - interval '1 hour')
    into last_at, hour_count
    from public.report_authors a join public.reports r2 on r2.id = a.report_id
   where a.user_id = me.id and r2.created_at > now() - interval '1 hour';
  if last_at is not null and last_at > now() - interval '60 seconds' then
    raise exception 'Du hast gerade erst gemeldet – bitte kurz warten.' using errcode = 'P0001';
  end if;
  if hour_count >= 12 or (me.reputation <= -10 and hour_count >= 2) then
    raise exception 'Stündliches Meldelimit erreicht.' using errcode = 'P0001';
  end if;

  insert into public.reports (lat, lng, street, kind, author_rep, expires_at)
  values (p_lat, p_lng, public._clean_street(p_street), kind, me.reputation, now() + interval '20 minutes')
  returning * into r;
  insert into public.report_authors (report_id, user_id) values (r.id, me.id);
  perform public._alert_cars(r.id, me.id);
  return jsonb_build_object('merged', false, 'report', public._report_json(r, me.id, p_lat, p_lng));
end $$;

-- Art nachträglich festlegen (nur eigene, nur in den ersten 5 Minuten)
create or replace function public.set_report_kind(p_id bigint, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me(); r public.reports;
begin
  if p_kind not in ('patrol', 'foot', 'car', 'tow') then raise exception 'Art ist ungültig.'; end if;
  select r2.* into r from public.reports r2 join public.report_authors a on a.report_id = r2.id
   where r2.id = p_id and a.user_id = me.id;
  if not found then raise exception 'Meldung nicht gefunden.'; end if;
  if r.created_at < now() - interval '5 minutes' then raise exception 'Die Meldung kann nicht mehr geändert werden.'; end if;
  update public.reports set kind = p_kind where id = r.id returning * into r;
  return public._report_json(r, me.id);
end $$;

-- Abstimmen: "Stimmt" (bestätigen) / "Falschmeldung"
create or replace function public.vote_report(p_id bigint, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me(); r public.reports; author uuid; v int;
begin
  v := case p_value when 'confirm' then 1 when 'gone' then -1 end;
  if v is null then raise exception 'Stimme ist ungültig.'; end if;
  select * into r from public.reports where id = p_id and status <> 'removed';
  if not found then raise exception 'Meldung nicht gefunden.'; end if;
  select user_id into author from public.report_authors where report_id = r.id;
  if author = me.id then
    if v = 1 then raise exception 'Eigene Meldungen kannst du nicht bestätigen.'; end if;
    update public.reports set status = 'gone', updated_at = now() where id = r.id;
  else
    if r.status <> 'active' or r.expires_at < now() then raise exception 'Diese Meldung ist nicht mehr aktiv.'; end if;
    perform public._apply_vote(r.id, me.id, v);
    if v = 1 then perform public._alert_cars(r.id, me.id); end if;
  end if;
  select * into r from public.reports where id = p_id;
  return public._report_json(r, me.id);
end $$;

-- Rückgängig: eigene Meldung entfernen
create or replace function public.delete_report(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me();
begin
  update public.reports r set status = 'removed', updated_at = now()
    from public.report_authors a
   where a.report_id = r.id and r.id = p_id and a.user_id = me.id;
  if not found then raise exception 'Meldung nicht gefunden.'; end if;
end $$;

-- Profil
create or replace function public.get_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me_any();
begin
  return jsonb_build_object(
    'id', me.id, 'name', me.name, 'reputation', me.reputation, 'alert_radius', me.alert_radius,
    'park_reminder', me.park_reminder, 'created_at', me.created_at,
    'access', me.access, 'is_admin', me.is_admin, 'access_note', me.access_note,
    'pending_count', case when me.is_admin then (select count(*) from public.profiles where access = 'pending') else null end,
    'confirmed', (select coalesce(sum(r.confirms), 0) from public.reports r
                  join public.report_authors a on a.report_id = r.id where a.user_id = me.id));
end $$;

create or replace function public.update_profile(p_name text default null, p_alert_radius int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me_any();
begin
  if p_name is not null and char_length(btrim(p_name)) not between 2 and 40 then
    raise exception 'Der Name muss 2 bis 40 Zeichen lang sein.';
  end if;
  if p_alert_radius is not null and p_alert_radius not in (150, 300, 500) then
    raise exception 'Warnradius ist ungültig.';
  end if;
  update public.profiles
     set name = coalesce(btrim(p_name), name), alert_radius = coalesce(p_alert_radius, alert_radius)
   where id = me.id;
  return public.get_profile();
end $$;

-- Mein Auto
create or replace function public.set_car(p_lat float8, p_lng float8, p_street text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me(); c public.cars;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Standort ist ungültig.';
  end if;
  insert into public.cars (user_id, lat, lng, street, parked_at)
  values (me.id, p_lat, p_lng, public._clean_street(p_street), now())
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, street = excluded.street, parked_at = excluded.parked_at,
    park_prompt_at = case
      when public._dist_m(public.cars.lat, public.cars.lng, excluded.lat, excluded.lng) > 100
        or public.cars.parked_at < now() - interval '1 hour' then null
      else public.cars.park_prompt_at end
  returning * into c;
  delete from public.car_alerts where user_id = me.id;
  return to_jsonb(c);
end $$;

-- Erinnerung beim Parken an/aus
create or replace function public.set_park_reminder(p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me();
begin
  update public.profiles set park_reminder = coalesce(p_on, true) where id = me.id;
  return public.get_profile();
end $$;

-- Für den aktuellen Parkplatz keine Erinnerung mehr (Parkschein gelöst oder hier nicht nötig)
create or replace function public.dismiss_park_prompt()
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me();
begin
  update public.cars set park_prompt_at = coalesce(park_prompt_at, now()) where user_id = me.id;
end $$;

create or replace function public.remove_car()
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me();
begin
  delete from public.cars where user_id = me.id;
  delete from public.car_alerts where user_id = me.id;
end $$;

-- Parkschein (Countdown + Erinnerung; gezahlt wird in der EasyPark-App)
create or replace function public.start_parking(p_minutes int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me(); s public.parking_sessions;
begin
  if p_minutes is null or p_minutes not between 5 and 1440 then raise exception 'Parkdauer ist ungültig.'; end if;
  update public.parking_sessions set status = 'stopped', stopped_at = now() where user_id = me.id and status = 'active';
  insert into public.parking_sessions (user_id, status, ends_at)
  values (me.id, 'active', now() + make_interval(mins => p_minutes)) returning * into s;
  return to_jsonb(s);
end $$;

create or replace function public.extend_parking(p_minutes int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me(); s public.parking_sessions;
begin
  if p_minutes is null or p_minutes not between 5 and 600 then raise exception 'Dauer ist ungültig.'; end if;
  update public.parking_sessions
     set ends_at = greatest(ends_at, now()) + make_interval(mins => p_minutes), reminded = false
   where user_id = me.id and status = 'active'
  returning * into s;
  if not found then raise exception 'Kein laufender Parkschein.'; end if;
  return to_jsonb(s);
end $$;

create or replace function public.stop_parking()
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me();
begin
  update public.parking_sessions set status = 'stopped', stopped_at = now() where user_id = me.id and status = 'active';
end $$;

-- Push-Abo des Geräts speichern / entfernen
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me_any();
begin
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Ungültiges Push-Abo.'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (me.id, p_endpoint, left(p_p256dh, 200), left(p_auth, 100))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me_any();
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = me.id;
end $$;

-- ---------------------------------------------------------------------
--  Zugang: Anfrage, Freigabe durch Admins
-- ---------------------------------------------------------------------
-- Kurze Nachricht an die Admins, solange die Anfrage offen ist
create or replace function public.set_access_note(p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me_any();
begin
  if me.access <> 'pending' then raise exception 'Deine Anfrage ist schon bearbeitet.'; end if;
  update public.profiles set access_note = nullif(left(btrim(coalesce(p_note, '')), 300), '') where id = me.id;
  return public.get_profile();
end $$;

-- Liste für Admins: offene, freigegebene oder abgelehnte Nutzer
create or replace function public.admin_list_users(p_filter text default 'pending')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._admin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'email', u.email, 'access', p.access, 'note', p.access_note,
      'is_admin', p.is_admin, 'created_at', p.created_at, 'changed_at', p.access_changed_at)
      order by p.created_at desc)
    from (select * from public.profiles
           where p_filter = 'all' or access = p_filter
           order by created_at desc limit 300) p
    join auth.users u on u.id = p.id), '[]'::jsonb);
end $$;

-- Freigeben / ablehnen / wieder sperren
create or replace function public.admin_set_access(p_user uuid, p_access text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._admin(); old text;
begin
  if p_access not in ('approved', 'rejected', 'pending') then raise exception 'Ungültiger Status.'; end if;
  if p_user = me.id then raise exception 'Deinen eigenen Zugang kannst du nicht ändern.'; end if;
  select access into old from public.profiles where id = p_user;
  if not found then raise exception 'Nutzer nicht gefunden.'; end if;
  update public.profiles set access = p_access, access_changed_at = now() where id = p_user;
  if p_access = 'approved' and old <> 'approved' then
    insert into public.outbox (user_id, kind, payload) values (p_user, 'access_granted', jsonb_build_object(
      'type', 'access_granted',
      'title', '✅ Du bist freigeschaltet',
      'body', 'Willkommen bei ParkCheck! Tippe hier, um loszulegen.',
      'tag', 'access',
      'url', '/'));
  end if;
  if p_access <> 'approved' then
    delete from public.cars where user_id = p_user;
    update public.parking_sessions set status = 'stopped', stopped_at = now() where user_id = p_user and status = 'active';
  end if;
  return jsonb_build_object('id', p_user, 'access', p_access);
end $$;

-- DSGVO: Datenexport (Art. 20) und Konto löschen (Art. 17)
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._me_any();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'profile', to_jsonb(me),
    'email', (select email from auth.users where id = me.id),
    'reports', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r join public.report_authors a on a.report_id = r.id where a.user_id = me.id), '[]'),
    'votes', coalesce((select jsonb_agg(jsonb_build_object('report_id', report_id, 'value', value, 'created_at', created_at)) from public.votes where user_id = me.id), '[]'),
    'car', (select to_jsonb(c) from public.cars c where c.user_id = me.id),
    'parking_sessions', coalesce((select jsonb_agg(to_jsonb(s)) from public.parking_sessions s where s.user_id = me.id), '[]'),
    'push_subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'created_at', created_at)) from public.push_subscriptions where user_id = me.id), '[]'));
end $$;

-- Löscht das Konto. Meldungen bleiben ohne Nutzerbezug für die anderen erhalten.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
--  Neue Nutzer bekommen automatisch ein Profil
-- ---------------------------------------------------------------------
create or replace function public._on_auth_user_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 40))
  on conflict (id) do nothing;
  -- Admins bekommen eine Nachricht über die neue Zugangsanfrage
  insert into public.outbox (user_id, kind, payload)
  select a.id, 'access_request', jsonb_build_object(
    'type', 'access_request',
    'title', '👋 Neue Zugangsanfrage',
    'body', coalesce(nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 40), ''), 'Jemand')
            || ' möchte ParkCheck nutzen. Tippe hier zum Prüfen.',
    'tag', 'access-request',
    'url', '/?requests=1')
  from public.profiles a where a.is_admin and a.access = 'approved' and a.id <> new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public._on_auth_user_created();

-- ---------------------------------------------------------------------
--  Push: jede neue Benachrichtigung ruft die Edge Function "send-push" auf
-- ---------------------------------------------------------------------
create or replace function public._outbox_send_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  push_url text;
  push_secret text;
  subs jsonb;
begin
  select value into push_url from public.app_config where key = 'push_url';
  select value into push_secret from public.app_config where key = 'push_secret';
  if push_url is null or push_secret is null then return new; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
    into subs from public.push_subscriptions where user_id = new.user_id;
  if subs is null then return new; end if;
  new.request_id := net.http_post(
    url := push_url,
    body := jsonb_build_object('subscriptions', subs, 'payload', new.payload),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', push_secret),
    timeout_milliseconds := 8000);
  return new;
exception when others then
  -- Push darf nie das Melden blockieren
  return new;
end $$;

drop trigger if exists outbox_send_push on public.outbox;
create trigger outbox_send_push before insert on public.outbox
  for each row execute function public._outbox_send_push();

-- ---------------------------------------------------------------------
--  Taktgeber (jede Minute): Meldungen ablaufen lassen, Parkschein-Erinnerungen
-- ---------------------------------------------------------------------
create or replace function public._cleanup_push()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Abgemeldete Geräte entfernen (meldet die Edge Function als "gone" zurück)
  delete from public.push_subscriptions
   where endpoint in (
     select jsonb_array_elements_text((resp.content)::jsonb -> 'gone')
       from net._http_response resp
       join public.outbox o on o.request_id = resp.id
      where o.created_at > now() - interval '2 hours'
        and resp.status_code = 200
        and resp.content like '{%');
exception when others then
  null;
end $$;

create or replace function public.tick()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reports set status = 'expired' where status = 'active' and expires_at <= now();

  with due as (
    update public.parking_sessions set reminded = true
     where status = 'active' and not reminded and ends_at - now() <= interval '10 minutes' and ends_at > now()
    returning id, user_id, ends_at
  )
  insert into public.outbox (user_id, kind, payload)
  select user_id, 'parking_reminder', jsonb_build_object(
    'title', '⏱️ Parkschein läuft in ' || greatest(1, ceil(extract(epoch from ends_at - now()) / 60))::int || ' Min. ab',
    'body', 'Jetzt in EasyPark verlängern?',
    'tag', 'parking-' || id,
    'url', '/?car=1',
    'sessionId', id)
  from due;

  update public.parking_sessions set status = 'expired' where status = 'active' and ends_at <= now();

  with due as (
    update public.cars c set park_prompt_at = now()
      from public.profiles p
     where p.id = c.user_id and p.park_reminder and not p.banned and p.access = 'approved'
       and c.park_prompt_at is null
       and c.parked_at <= now() - interval '3 minutes'
       and c.parked_at >  now() - interval '30 minutes'
       and not exists (select 1 from public.parking_sessions s
                        where s.user_id = c.user_id
                          and (s.status = 'active' or s.started_at >= c.parked_at - interval '15 minutes'))
    returning c.user_id, c.lat, c.lng, c.street
  ), counted as (
    select d.*, (select count(*) from public.reports r
                  where d.street is not null and lower(r.street) = lower(d.street)
                    and r.lat between d.lat - 0.02 and d.lat + 0.02
                    and r.lng between d.lng - 0.03 and d.lng + 0.03
                    and r.created_at > now() - interval '30 days'
                    and r.status <> 'removed')::int as n
      from due d
  )
  insert into public.outbox (user_id, kind, payload)
  select user_id, 'park_prompt', jsonb_build_object(
    'type', 'park_prompt',
    'title', '🅿️ Parkschein gecheckt?',
    'body', case when n > 0
                 then street || ': ' || n || case when n = 1 then ' Ticket' else ' Tickets' end
                      || ' in den letzten 30 Tagen gemeldet. Prüfe, ob du einen Parkschein brauchst.'
                 else 'Du hast gerade geparkt. Prüfe, ob du hier einen Parkschein brauchst – und ob er schon läuft.' end,
    'tag', 'park-prompt',
    'url', '/?car=1&park=1',
    'street', street,
    'count', n)
  from counted;

  perform public._cleanup_push();
  delete from public.outbox where created_at < now() - interval '2 days';
  delete from public.car_alerts where created_at < now() - interval '2 days';
end $$;

select cron.schedule('parkradar-tick', '* * * * *', 'select public.tick()');

-- ---------------------------------------------------------------------
--  Straßen-Statistik: Wie viele Tickets wurden in dieser Straße gemeldet, wann zuletzt?
-- ---------------------------------------------------------------------
create index if not exists reports_street_idx on public.reports (lower(street), created_at desc);

create or replace function public.street_stats(p_lat float8, p_lng float8, p_street text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._me();
  s text := public._clean_street(p_street);
  res jsonb;
begin
  if s is null or p_lat is null or p_lng is null then return null; end if;
  with t as (
    select r.created_at, r.kind from public.reports r
     where lower(r.street) = lower(s)
       -- gleicher Straßenname nur in der Umgebung (~2 km), nicht in der ganzen Stadt
       and r.lat between p_lat - 0.02 and p_lat + 0.02
       and r.lng between p_lng - 0.03 and p_lng + 0.03
       and r.created_at > now() - interval '90 days'
       and r.status <> 'removed'
       -- sofort widerlegte Meldungen zählen nicht
       and not (r.status = 'gone' and r.peak_confirms = 0 and r.updated_at - r.created_at < interval '5 minutes')
  )
  select jsonb_build_object(
    'street', s,
    'today',  count(*) filter (where t.created_at >= (date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')),
    'week',   count(*) filter (where t.created_at > now() - interval '7 days'),
    'month',  count(*) filter (where t.created_at > now() - interval '30 days'),
    'total',  count(*),
    'last',   max(t.created_at),
    'hours',  (select jsonb_agg(coalesce(h.n, 0) order by g)
                 from generate_series(0, 23) g
                 left join (select extract(hour from created_at at time zone 'Europe/Berlin')::int hr, count(*) n from t group by 1) h on h.hr = g))
    into res from t;
  return res;
end $$;

-- ---------------------------------------------------------------------
--  Rechte: interne Funktionen sind für die App nicht aufrufbar
-- ---------------------------------------------------------------------
revoke execute on function public._me() from public, anon, authenticated;
revoke execute on function public._me_any() from public, anon, authenticated;
revoke execute on function public._admin() from public, anon, authenticated;
revoke execute on function public._report_json(public.reports, uuid, float8, float8) from public, anon, authenticated;
revoke execute on function public._alert_cars(bigint, uuid) from public, anon, authenticated;
revoke execute on function public._apply_vote(bigint, uuid, int) from public, anon, authenticated;
revoke execute on function public._on_auth_user_created() from public, anon, authenticated;
revoke execute on function public._outbox_send_push() from public, anon, authenticated;
revoke execute on function public._cleanup_push() from public, anon, authenticated;
revoke execute on function public.tick() from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
--  Live-Updates (Realtime) für Meldungen, Benachrichtigungen und Parkscheine
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['reports', 'outbox', 'parking_sessions'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then null;
    end;
  end loop;
end $$;
