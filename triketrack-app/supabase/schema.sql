
-- Run this in Supabase SQL Editor (SQL -> New query).
-- This is the merged rollup schema for the admin dashboard + mobile app.
-- For best results, run this on a clean/reset database.
-- Target project: `irkbdinugnasepjowhzr.supabase.co`

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Storage bootstrap ----------
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('driver-avatars', 'driver-avatars', true)
  on conflict (id) do nothing;
exception
  when undefined_table then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_can_read_driver_avatars'
  ) then
    create policy public_can_read_driver_avatars
    on storage.objects
    for select
    to public
    using (bucket_id = 'driver-avatars');
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_can_upload_driver_avatars'
  ) then
    create policy public_can_upload_driver_avatars
    on storage.objects
    for insert
    to anon, authenticated
    with check (bucket_id = 'driver-avatars');
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_can_update_driver_avatars'
  ) then
    create policy public_can_update_driver_avatars
    on storage.objects
    for update
    to anon, authenticated
    using (bucket_id = 'driver-avatars')
    with check (bucket_id = 'driver-avatars');
  end if;
exception
  when undefined_table then null;
end $$;

-- ---------- Enums ----------
do $$
begin
  create type public.admin_role as enum ('superadmin', 'barangay_admin', 'toda_admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.entity_status as enum ('active', 'inactive', 'suspended');
exception
  when duplicate_object then null;
end $$;

drop function if exists public.entity_status_from_text(text);
create or replace function public.entity_status_from_text(p_label text)
returns public.entity_status
language plpgsql
immutable
as $$
declare
  v_status public.entity_status;
begin
  select enum_value
  into v_status
  from unnest(enum_range(null::public.entity_status)) as enum_value
  where lower(enum_value::text) = lower(trim(p_label))
  limit 1;

  if v_status is null then
    raise exception 'Invalid entity_status value: %', p_label;
  end if;

  return v_status;
end;
$$;

do $$
begin
  create type public.qr_status as enum ('active', 'inactive', 'revoked', 'expired');
exception
  when duplicate_object then null;
end $$;

drop function if exists public.qr_status_from_text(text);
create or replace function public.qr_status_from_text(p_label text)
returns public.qr_status
language plpgsql
immutable
as $$
declare
  v_status public.qr_status;
begin
  select enum_value
  into v_status
  from unnest(enum_range(null::public.qr_status)) as enum_value
  where lower(enum_value::text) = lower(trim(p_label))
  limit 1;

  if v_status is null then
    raise exception 'Invalid qr_status value: %', p_label;
  end if;

  return v_status;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'trip_status'
  ) and (
    exists (
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'trip_status'
        and e.enumlabel in ('SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED')
    )
    or exists (
      select 1
      from (
        values ('scheduled'), ('ongoing'), ('completed'), ('cancelled')
      ) as required(label)
      where not exists (
        select 1
        from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
        join pg_enum e on e.enumtypid = t.oid
        where n.nspname = 'public'
          and t.typname = 'trip_status'
          and e.enumlabel = required.label
      )
    )
  ) then
    drop view if exists public.trips_with_week_bucket cascade;
    drop table if exists public.trip_points cascade;
    drop table if exists public.passenger_scans cascade;
    drop table if exists public.reports cascade;
    drop table if exists public.report_media cascade;
    drop table if exists public.violations cascade;
    drop table if exists public.trip_route_points cascade;
    drop table if exists public.trip_routes cascade;
    drop table if exists public.violation_proofs cascade;
    drop table if exists public.mobile_violations cascade;
    drop table if exists public.violation_appeals cascade;
    drop table if exists public.trips cascade;
    drop type public.trip_status;
  end if;
exception
  when undefined_object then null;
end $$;

do $$
begin
  create type public.trip_status as enum ('scheduled', 'ongoing', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

drop function if exists public.trip_status_from_text(text);
create or replace function public.trip_status_from_text(p_label text)
returns public.trip_status
language plpgsql
immutable
as $$
declare
  v_status public.trip_status;
begin
  select enum_value
  into v_status
  from unnest(enum_range(null::public.trip_status)) as enum_value
  where lower(enum_value::text) = lower(trim(p_label))
  limit 1;

  if v_status is null then
    raise exception 'Invalid trip_status value: %', p_label;
  end if;

  return v_status;
end;
$$;

do $$
begin
  create type public.report_status as enum ('submitted', 'under_review', 'verified', 'resolved', 'dismissed');
exception
  when duplicate_object then null;
end $$;

drop function if exists public.report_status_from_text(text);
create or replace function public.report_status_from_text(p_label text)
returns public.report_status
language plpgsql
immutable
as $$
declare
  v_status public.report_status;
begin
  select enum_value
  into v_status
  from unnest(enum_range(null::public.report_status)) as enum_value
  where lower(enum_value::text) = lower(trim(p_label))
  limit 1;

  if v_status is null then
    raise exception 'Invalid report_status value: %', p_label;
  end if;

  return v_status;
end;
$$;

do $$
begin
  create type public.violation_status as enum ('open', 'under_review', 'resolved', 'dismissed');
exception
  when duplicate_object then null;
end $$;

drop function if exists public.violation_status_from_text(text);
create or replace function public.violation_status_from_text(p_label text)
returns public.violation_status
language plpgsql
immutable
as $$
declare
  v_status public.violation_status;
begin
  select enum_value
  into v_status
  from unnest(enum_range(null::public.violation_status)) as enum_value
  where lower(enum_value::text) = lower(trim(p_label))
  limit 1;

  if v_status is null then
    raise exception 'Invalid violation_status value: %', p_label;
  end if;

  return v_status;
end;
$$;

do $$
begin
  create type public.violation_source as enum ('system', 'passenger_report', 'admin');
exception
  when duplicate_object then null;
end $$;

drop function if exists public.violation_source_from_text(text);
create or replace function public.violation_source_from_text(p_label text)
returns public.violation_source
language plpgsql
immutable
as $$
declare
  v_status public.violation_source;
begin
  select enum_value
  into v_status
  from unnest(enum_range(null::public.violation_source)) as enum_value
  where lower(enum_value::text) = lower(trim(p_label))
  limit 1;

  if v_status is null then
    raise exception 'Invalid violation_source value: %', p_label;
  end if;

  return v_status;
end;
$$;

do $$
begin
  create type public.media_type as enum ('image', 'video', 'audio', 'document');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.mobile_violation_type as enum ('GEOFENCE_BOUNDARY', 'ROUTE_DEVIATION', 'UNAUTHORIZED_STOP');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.mobile_violation_status as enum ('OPEN', 'UNDER_REVIEW', 'RESOLVED');
exception
  when duplicate_object then null;
end $$;

drop function if exists public.mobile_violation_status_from_text(text);
create or replace function public.mobile_violation_status_from_text(p_label text)
returns public.mobile_violation_status
language plpgsql
immutable
as $$
declare
  v_status public.mobile_violation_status;
begin
  select enum_value
  into v_status
  from unnest(enum_range(null::public.mobile_violation_status)) as enum_value
  where lower(enum_value::text) = lower(trim(p_label))
  limit 1;

  if v_status is null then
    raise exception 'Invalid mobile_violation_status value: %', p_label;
  end if;

  return v_status;
end;
$$;

do $$
begin
  create type public.mobile_violation_priority as enum ('HIGH', 'MEDIUM', 'LOW');
exception
  when duplicate_object then null;
end $$;

drop function if exists public.mobile_violation_priority_from_text(text);
create or replace function public.mobile_violation_priority_from_text(p_label text)
returns public.mobile_violation_priority
language plpgsql
immutable
as $$
declare
  v_status public.mobile_violation_priority;
begin
  select enum_value
  into v_status
  from unnest(enum_range(null::public.mobile_violation_priority)) as enum_value
  where lower(enum_value::text) = lower(trim(p_label))
  limit 1;

  if v_status is null then
    raise exception 'Invalid mobile_violation_priority value: %', p_label;
  end if;

  return v_status;
end;
$$;

do $$
begin
  create type public.appeal_status as enum ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'WITHDRAWN');
exception
  when duplicate_object then null;
end $$;

drop function if exists public.appeal_status_from_text(text);
create or replace function public.appeal_status_from_text(p_label text)
returns public.appeal_status
language plpgsql
immutable
as $$
declare
  v_status public.appeal_status;
begin
  select enum_value
  into v_status
  from unnest(enum_range(null::public.appeal_status)) as enum_value
  where lower(enum_value::text) = lower(trim(p_label))
  limit 1;

  if v_status is null then
    raise exception 'Invalid appeal_status value: %', p_label;
  end if;

  return v_status;
end;
$$;

-- ---------- Master tables ----------
create table if not exists public.barangays (
  barangay_id bigint generated always as identity primary key,
  barangay_name text not null,
  district text,
  city text not null,
  status public.entity_status not null default public.entity_status_from_text('active'),
  created_at timestamptz not null default now(),
  unique (barangay_name, city)
);

create table if not exists public.todas (
  toda_id bigint generated always as identity primary key,
  barangay_id bigint not null references public.barangays(barangay_id) on delete restrict,
  toda_name text not null,
  status public.entity_status not null default public.entity_status_from_text('active'),
  created_at timestamptz not null default now(),
  unique (barangay_id, toda_name)
);

create table if not exists public.admin_accounts (
  admin_id bigint generated always as identity primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  admin_role public.admin_role not null,
  barangay_id bigint references public.barangays(barangay_id) on delete restrict,
  toda_id bigint references public.todas(toda_id) on delete restrict,
  status public.entity_status not null default public.entity_status_from_text('active'),
  created_at timestamptz not null default now(),
  constraint admin_scope_check check (
    (admin_role = 'superadmin' and barangay_id is null and toda_id is null)
    or
    (admin_role = 'barangay_admin' and barangay_id is not null and toda_id is null)
    or
    (admin_role = 'toda_admin' and toda_id is not null and barangay_id is null)
  )
);

create table if not exists public.tricycles (
  tricycle_id bigint generated always as identity primary key,
  toda_id bigint not null references public.todas(toda_id) on delete restrict,
  plate_no text not null unique,
  reg_no text unique,
  permit_expiration_date date,
  status public.entity_status not null default public.entity_status_from_text('active'),
  created_at timestamptz not null default now()
);

create table if not exists public.routes (
  route_id bigint generated always as identity primary key,
  toda_id bigint not null references public.todas(toda_id) on delete restrict,
  origin text not null,
  destination text not null,
  geofence_geojson jsonb,
  status public.entity_status not null default public.entity_status_from_text('active'),
  created_at timestamptz not null default now(),
  unique (toda_id, origin, destination)
);

create table if not exists public.qr_codes (
  qr_id bigint generated always as identity primary key,
  driver_id bigint,
  tricycle_id bigint references public.tricycles(tricycle_id) on delete set null,
  qr_token text not null unique,
  status public.qr_status not null default public.qr_status_from_text('active'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.qr_codes add column if not exists driver_id bigint;
alter table public.qr_codes add column if not exists tricycle_id bigint;
alter table public.qr_codes alter column tricycle_id drop not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'drivers'
      and column_name = 'driver_id'
      and data_type <> 'bigint'
  ) then
    drop table if exists public.driver_locations cascade;
    drop table if exists public.trip_points cascade;
    drop table if exists public.trip_routes cascade;
    drop table if exists public.violation_proofs cascade;
    drop table if exists public.mobile_violations cascade;
    drop table if exists public.violation_appeals cascade;
    drop table if exists public.trips cascade;
    drop table if exists public.violations cascade;
    drop table if exists public.drivers cascade;
  end if;
exception
  when wrong_object_type then null;
end $$;

create table if not exists public.drivers (
  driver_id bigint generated always as identity primary key,
  driver_code text generated always as ('D-' || lpad(driver_id::text, 3, '0')) stored unique,
  toda_id bigint not null references public.todas(toda_id) on delete restrict,
  tricycle_id bigint references public.tricycles(tricycle_id) on delete set null,
  qr_id bigint references public.qr_codes(qr_id) on delete set null,
  first_name text not null,
  last_name text not null,
  contact_no text,
  avatar_url text,
  password_hash text,
  status public.entity_status not null default public.entity_status_from_text('active'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drivers add column if not exists contact_no text;
alter table public.drivers add column if not exists avatar_url text;
alter table public.drivers add column if not exists password_hash text;
alter table public.drivers add column if not exists updated_at timestamptz not null default now();
alter table public.drivers add column if not exists tricycle_id bigint;
alter table public.drivers add column if not exists qr_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'qr_codes_driver_id_fkey'
      and conrelid = 'public.qr_codes'::regclass
  ) then
    alter table public.qr_codes
      add constraint qr_codes_driver_id_fkey
      foreign key (driver_id) references public.drivers(driver_id) on delete set null;
  end if;
exception
  when undefined_table then null;
end $$;

update public.drivers
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

drop trigger if exists trg_drivers_updated_at on public.drivers;
create trigger trg_drivers_updated_at
before update on public.drivers
for each row execute function public.set_updated_at();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'driver_locations'
      and column_name = 'driver_id'
      and data_type <> 'bigint'
  ) then
    drop table if exists public.driver_locations cascade;
  end if;
exception
  when wrong_object_type then
    execute 'drop view if exists public.driver_locations cascade';
end $$;

create table if not exists public.driver_locations (
  driver_id bigint primary key references public.drivers(driver_id) on delete cascade,
  driver_code text not null,
  latitude double precision not null,
  longitude double precision not null,
  speed double precision,
  heading double precision,
  accuracy double precision,
  is_online boolean not null default true,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_driver_locations_updated_at on public.driver_locations;
create trigger trg_driver_locations_updated_at
before update on public.driver_locations
for each row execute function public.set_updated_at();

create table if not exists public.report_types (
  report_type_id bigint generated always as identity primary key,
  code text not null unique,
  label text not null
);

create table if not exists public.violation_types (
  violation_type_id bigint generated always as identity primary key,
  code text not null unique,
  label text not null
);

-- ---------- Trips ----------
create table if not exists public.trips (
  trip_id bigint generated always as identity primary key,
  driver_id bigint not null references public.drivers(driver_id) on delete restrict,
  tricycle_id bigint not null references public.tricycles(tricycle_id) on delete restrict,
  route_id bigint not null references public.routes(route_id) on delete restrict,
  trip_start timestamptz not null,
  trip_end timestamptz,
  duration_minutes integer,
  fare_amount numeric(10, 2),
  trip_status public.trip_status not null default public.trip_status_from_text('scheduled'),
  created_at timestamptz not null default now(),
  constraint trip_time_check check (trip_end is null or trip_end >= trip_start),
  constraint trip_duration_check check (duration_minutes is null or duration_minutes >= 0),
  constraint trip_fare_check check (fare_amount is null or fare_amount >= 0)
);

-- Mobile trip transactions keep the rendered route, dashed off-road connector,
-- and GPS quality summary so the detail screen can replay the exact saved trip
-- without depending on a live map-matching service.
alter table public.trips add column if not exists start_location_raw jsonb;
alter table public.trips add column if not exists start_location_matched jsonb;
alter table public.trips add column if not exists end_location_raw jsonb;
alter table public.trips add column if not exists end_location_matched jsonb;
alter table public.trips add column if not exists start_display_name text;
alter table public.trips add column if not exists end_display_name text;
alter table public.trips add column if not exists start_coordinate jsonb;
alter table public.trips add column if not exists end_coordinate jsonb;
alter table public.trips add column if not exists dashed_start_connector jsonb;
alter table public.trips add column if not exists dashed_end_connector jsonb;
alter table public.trips add column if not exists route_trace_geojson jsonb;
alter table public.trips add column if not exists trip_metrics jsonb;
alter table public.trips add column if not exists gps_quality_summary jsonb;
alter table public.trips add column if not exists raw_gps_point_count integer not null default 0;
alter table public.trips add column if not exists matched_point_count integer not null default 0;
alter table public.trips add column if not exists offline_segments_count integer not null default 0;
alter table public.trips add column if not exists sync_status text not null default 'SYNC_PENDING';

create table if not exists public.trip_points (
  point_id bigint generated always as identity primary key,
  trip_id bigint references public.trips(trip_id) on delete cascade,
  driver_id bigint not null references public.drivers(driver_id) on delete restrict,
  recorded_at timestamptz not null,
  lng double precision not null,
  lat double precision not null,
  speed double precision,
  heading double precision,
  accuracy double precision,
  altitude double precision,
  provider text,
  dedup_key text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Passenger reports ----------
create table if not exists public.passenger_scans (
  scan_id bigint generated always as identity primary key,
  trip_id bigint not null references public.trips(trip_id) on delete cascade,
  qr_id bigint not null references public.qr_codes(qr_id) on delete restrict,
  scanned_at timestamptz not null default now(),
  device_info jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  report_id bigint generated always as identity primary key,
  scan_id bigint not null references public.passenger_scans(scan_id) on delete cascade,
  trip_id bigint not null references public.trips(trip_id) on delete cascade,
  report_type_id bigint not null references public.report_types(report_type_id) on delete restrict,
  description text not null,
  reported_at timestamptz not null default now(),
  status public.report_status not null default public.report_status_from_text('submitted'),
  created_at timestamptz not null default now()
);

create table if not exists public.report_media (
  media_id bigint generated always as identity primary key,
  report_id bigint not null references public.reports(report_id) on delete cascade,
  media_type public.media_type not null,
  file_url text not null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------- Dashboard violations ----------
create table if not exists public.violations (
  violation_id bigint generated always as identity primary key,
  violation_type_id bigint not null references public.violation_types(violation_type_id) on delete restrict,
  trip_id bigint references public.trips(trip_id) on delete set null,
  report_id bigint references public.reports(report_id) on delete set null,
  driver_id bigint references public.drivers(driver_id) on delete set null,
  tricycle_id bigint references public.tricycles(tricycle_id) on delete set null,
  description text,
  detected_at timestamptz not null default now(),
  source public.violation_source not null default public.violation_source_from_text('system'),
  status public.violation_status not null default public.violation_status_from_text('open'),
  created_at timestamptz not null default now(),
  constraint violation_reference_check check (
    trip_id is not null
    or report_id is not null
    or driver_id is not null
    or tricycle_id is not null
  )
);
-- ---------- Mobile app compatibility tables ----------
create table if not exists public.trip_route_points (
  trip_id bigint not null references public.trips(trip_id) on delete cascade,
  idx integer not null check (idx >= 0),
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, idx)
);

create table if not exists public.trip_routes (
  id bigint generated always as identity primary key,
  local_trip_id text not null,
  trip_id bigint references public.trips(trip_id) on delete set null,
  driver_id bigint not null references public.drivers(driver_id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mobile_violations (
  id uuid primary key default gen_random_uuid(),
  driver_id bigint not null references public.drivers(driver_id) on delete cascade,
  trip_id bigint references public.trips(trip_id) on delete set null,
  type public.mobile_violation_type not null,
  status public.mobile_violation_status not null default public.mobile_violation_status_from_text('OPEN'),
  priority public.mobile_violation_priority not null default public.mobile_violation_priority_from_text('MEDIUM'),
  occurred_at timestamptz not null default now(),
  title text,
  latitude double precision,
  longitude double precision,
  location_label text,
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.violation_appeals (
  id uuid primary key default gen_random_uuid(),
  violation_id uuid not null references public.mobile_violations(id) on delete cascade,
  driver_id bigint not null references public.drivers(driver_id) on delete cascade,
  reason text not null,
  details text,
  status public.appeal_status not null default public.appeal_status_from_text('SUBMITTED'),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.violation_proofs (
  id uuid primary key default gen_random_uuid(),
  violation_id uuid not null references public.mobile_violations(id) on delete cascade,
  driver_id bigint not null references public.drivers(driver_id) on delete cascade,
  file_url text not null,
  file_path text not null,
  file_type text,
  status text not null default 'UPLOADED',
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_notification_reads (
  admin_id bigint not null references public.admin_accounts(admin_id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (admin_id, notification_key)
);

drop trigger if exists trg_mobile_violations_updated_at on public.mobile_violations;
create trigger trg_mobile_violations_updated_at
before update on public.mobile_violations
for each row execute function public.set_updated_at();

drop trigger if exists trg_violation_appeals_updated_at on public.violation_appeals;
create trigger trg_violation_appeals_updated_at
before update on public.violation_appeals
for each row execute function public.set_updated_at();

drop trigger if exists trg_violation_proofs_updated_at on public.violation_proofs;
create trigger trg_violation_proofs_updated_at
before update on public.violation_proofs
for each row execute function public.set_updated_at();

-- ---------- RPCs for driver app ----------
drop function if exists public.authenticate_driver(text, text);
create or replace function public.authenticate_driver(p_driver_code text, p_password text)
returns table (
  id bigint,
  full_name text,
  driver_id text,
  contact_number text,
  plate_number text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    d.driver_id as id,
    trim(concat_ws(' ', d.first_name, d.last_name)) as full_name,
    coalesce(d.driver_code, d.driver_id::text) as driver_id,
    coalesce(d.contact_no, '') as contact_number,
    coalesce(t.plate_no, '') as plate_number,
    d.avatar_url
  from public.drivers d
  left join public.tricycles t on t.tricycle_id = d.tricycle_id
  where d.status = public.entity_status_from_text('active')
    and upper(coalesce(d.driver_code, d.driver_id::text)) = upper(p_driver_code)
    and d.password_hash is not null
    and d.password_hash = extensions.crypt(p_password, d.password_hash)
  limit 1;
end;
$$;

drop function if exists public.get_driver_profile(bigint);
create or replace function public.get_driver_profile(p_driver_id bigint)
returns table (
  id bigint,
  full_name text,
  driver_id text,
  contact_number text,
  plate_number text,
  avatar_url text,
  qr_id bigint,
  qr_token text,
  qr_status public.qr_status,
  qr_issued_at timestamptz,
  report_path text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    d.driver_id as id,
    trim(concat_ws(' ', d.first_name, d.last_name)) as full_name,
    coalesce(d.driver_code, d.driver_id::text) as driver_id,
    coalesce(d.contact_no, '') as contact_number,
    coalesce(t.plate_no, '') as plate_number,
    d.avatar_url,
    d.qr_id,
    qr.qr_token,
    qr.status as qr_status,
    qr.issued_at as qr_issued_at,
    case
      when qr.qr_token is not null then '/report/' || qr.qr_token
      else null
    end as report_path
  from public.drivers d
  left join public.tricycles t on t.tricycle_id = d.tricycle_id
  left join public.qr_codes qr on qr.qr_id = d.qr_id
  where d.driver_id = p_driver_id
  limit 1;
end;
$$;

drop function if exists public.set_driver_password(text, text);
create or replace function public.set_driver_password(p_driver_code text, p_password text)
returns table (
  id bigint,
  full_name text,
  driver_id text,
  contact_number text,
  plate_number text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with updated_driver as (
    update public.drivers d
    set
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
    where upper(coalesce(d.driver_code, d.driver_id::text)) = upper(p_driver_code)
      and d.status = public.entity_status_from_text('active')
    returning d.driver_id, d.driver_code, d.first_name, d.last_name, d.contact_no, d.tricycle_id, d.avatar_url
  )
  select
    d.driver_id as id,
    trim(concat_ws(' ', d.first_name, d.last_name)) as full_name,
    coalesce(d.driver_code, d.driver_id::text) as driver_id,
    coalesce(d.contact_no, '') as contact_number,
    coalesce(t.plate_no, '') as plate_number,
    d.avatar_url
  from updated_driver d
  left join public.tricycles t on t.tricycle_id = d.tricycle_id;
end;
$$;

drop function if exists public.set_driver_avatar(bigint, text);
create or replace function public.set_driver_avatar(
  p_driver_id bigint,
  p_avatar_url text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avatar_url text;
begin
  update public.drivers
  set
    avatar_url = p_avatar_url,
    updated_at = now()
  where driver_id = p_driver_id
    and status = public.entity_status_from_text('active')
  returning avatar_url into v_avatar_url;

  return v_avatar_url;
end;
$$;

drop function if exists public.upsert_driver_location(bigint, text, double precision, double precision, double precision, double precision, double precision, timestamptz);
create or replace function public.upsert_driver_location(
  p_driver_id bigint,
  p_driver_code text,
  p_latitude double precision,
  p_longitude double precision,
  p_speed double precision default null,
  p_heading double precision default null,
  p_accuracy double precision default null,
  p_recorded_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.driver_locations (
    driver_id,
    driver_code,
    latitude,
    longitude,
    speed,
    heading,
    accuracy,
    is_online,
    recorded_at,
    updated_at
  )
  values (
    p_driver_id,
    upper(p_driver_code),
    p_latitude,
    p_longitude,
    p_speed,
    p_heading,
    p_accuracy,
    true,
    coalesce(p_recorded_at, now()),
    now()
  )
  on conflict (driver_id) do update
  set
    driver_code = excluded.driver_code,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    speed = excluded.speed,
    heading = excluded.heading,
    accuracy = excluded.accuracy,
    is_online = true,
    recorded_at = excluded.recorded_at,
    updated_at = now();
end;
$$;

drop function if exists public.set_driver_location_offline(bigint);
create or replace function public.set_driver_location_offline(p_driver_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.driver_locations
  set
    is_online = false,
    updated_at = now()
  where driver_id = p_driver_id;
end;
$$;
drop function if exists public.start_trip(bigint, double precision, double precision);
create or replace function public.start_trip(
  p_driver_id bigint,
  p_start_lat double precision default null,
  p_start_lng double precision default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id bigint;
  v_tricycle_id bigint;
  v_route_id bigint;
  v_toda_id bigint;
begin
  select d.tricycle_id, d.toda_id, r.route_id
  into v_tricycle_id, v_toda_id, v_route_id
  from public.drivers d
  left join public.routes r on r.toda_id = d.toda_id and r.status = public.entity_status_from_text('active')
  where d.driver_id = p_driver_id
  order by r.route_id asc
  limit 1;

  if v_tricycle_id is null then
    raise exception 'Driver % has no tricycle assigned.', p_driver_id;
  end if;

  if v_route_id is null and v_toda_id is not null then
    insert into public.routes (toda_id, origin, destination, status)
    values (v_toda_id, 'Test Route', 'Live GPS Tracking', public.entity_status_from_text('active'))
    on conflict (toda_id, origin, destination) do update
      set status = public.entity_status_from_text('active')
    returning route_id into v_route_id;
  end if;

  if v_route_id is null then
    select r.route_id
    into v_route_id
    from public.routes r
    where r.status = public.entity_status_from_text('active')
    order by r.route_id asc
    limit 1;
  end if;

  if v_route_id is null then
    raise exception 'Driver % has no route available for testing.', p_driver_id;
  end if;

  insert into public.trips (driver_id, tricycle_id, route_id, trip_start, trip_status, fare_amount, duration_minutes)
  values (p_driver_id, v_tricycle_id, v_route_id, now(), public.trip_status_from_text('ongoing'), 0, 0)
  returning trip_id into v_trip_id;

  if p_start_lat is not null and p_start_lng is not null then
    insert into public.trip_points (
      trip_id,
      driver_id,
      recorded_at,
      lng,
      lat,
      dedup_key
    )
    values (
      v_trip_id,
      p_driver_id,
      now(),
      p_start_lng,
      p_start_lat,
      concat(v_trip_id::text, '-start')
    )
    on conflict (dedup_key) do nothing;
  end if;

  return v_trip_id;
end;
$$;

drop function if exists public.complete_trip(bigint, double precision, double precision, numeric, numeric, integer, jsonb);
create or replace function public.complete_trip(
  p_trip_id bigint,
  p_end_lat double precision,
  p_end_lng double precision,
  p_distance_km numeric,
  p_fare numeric,
  p_duration_seconds integer,
  p_route_points jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id bigint;
begin
  update public.trips
  set
    trip_end = now(),
    fare_amount = coalesce(p_fare, 0),
    duration_minutes = greatest(coalesce(ceil(coalesce(p_duration_seconds, 0) / 60.0), 0), 0),
    trip_status = public.trip_status_from_text('completed')
  where trip_id = p_trip_id
  returning driver_id into v_driver_id;

  delete from public.trip_route_points where trip_id = p_trip_id;

  insert into public.trip_route_points (trip_id, idx, latitude, longitude)
  select
    p_trip_id,
    (ord - 1)::int,
    (elem->>'latitude')::double precision,
    (elem->>'longitude')::double precision
  from jsonb_array_elements(coalesce(p_route_points, '[]'::jsonb)) with ordinality as t(elem, ord);

  if v_driver_id is not null then
    insert into public.trip_points (
      trip_id,
      driver_id,
      recorded_at,
      lng,
      lat,
      speed,
      dedup_key
    )
    values (
      p_trip_id,
      v_driver_id,
      now(),
      p_end_lng,
      p_end_lat,
      case when coalesce(p_duration_seconds, 0) > 0
        then (coalesce(p_distance_km, 0) * 1000.0) / p_duration_seconds
        else null
      end,
      concat(p_trip_id::text, '-end')
    )
    on conflict (dedup_key) do nothing;
  end if;
end;
$$;

drop view if exists public.trips_with_week_bucket;
create view public.trips_with_week_bucket as
select
  t.trip_id as id,
  t.driver_id,
  t.trip_start as started_at,
  t.trip_end as ended_at,
  upper(t.trip_status::text) as status,
  coalesce(t.fare_amount, 0)::numeric(10, 2) as fare,
  (
    select coalesce(sum(
      case
        when raw.prev_lat is not null and raw.prev_lng is not null then
          6371 * acos(
            greatest(
              -1,
              least(
                1,
                cos(radians(raw.prev_lat)) * cos(radians(raw.lat)) * cos(radians(raw.lng) - radians(raw.prev_lng))
                + sin(radians(raw.prev_lat)) * sin(radians(raw.lat))
              )
            )
          )
        else 0
      end
    ), 0)
    from (
      select
        tp.lat,
        tp.lng,
        lag(tp.lat) over (order by tp.recorded_at, tp.point_id) as prev_lat,
        lag(tp.lng) over (order by tp.recorded_at, tp.point_id) as prev_lng
      from public.trip_points tp
      where tp.trip_id = t.trip_id
    ) raw
  )::numeric(10, 3) as distance_km,
  coalesce(t.duration_minutes, 0) * 60 as duration_seconds,
  (t.trip_start at time zone 'utc')::date as trip_date,
  case
    when (t.trip_start at time zone 'utc')::date >= date_trunc('week', current_date)::date then 'THIS_WEEK'
    when (t.trip_start at time zone 'utc')::date >= (date_trunc('week', current_date)::date - 7)
      and (t.trip_start at time zone 'utc')::date < date_trunc('week', current_date)::date then 'LAST_WEEK'
    when (t.trip_start at time zone 'utc')::date < (current_date - 30) then 'OVER_30'
    else 'ALL'
  end as week_bucket
from public.trips t;

-- ---------- Indexes ----------
create index if not exists idx_todas_barangay_id on public.todas (barangay_id);
create index if not exists idx_admin_accounts_barangay_id on public.admin_accounts (barangay_id);
create index if not exists idx_admin_accounts_toda_id on public.admin_accounts (toda_id);
create index if not exists idx_admin_accounts_role on public.admin_accounts (admin_role);
create index if not exists idx_drivers_toda_id on public.drivers (toda_id);
create index if not exists idx_drivers_tricycle_id on public.drivers (tricycle_id);
create index if not exists idx_drivers_qr_id on public.drivers (qr_id);
create index if not exists idx_driver_locations_driver_code on public.driver_locations (driver_code);
create index if not exists idx_driver_locations_updated_at on public.driver_locations (updated_at desc);
create index if not exists idx_tricycles_toda_id on public.tricycles (toda_id);
create index if not exists idx_tricycles_permit_expiration_date on public.tricycles (permit_expiration_date);
create index if not exists idx_routes_toda_id on public.routes (toda_id);
create index if not exists idx_qr_codes_driver_id on public.qr_codes (driver_id);
create index if not exists idx_qr_codes_tricycle_id on public.qr_codes (tricycle_id);
create index if not exists idx_trips_driver_id on public.trips (driver_id);
create index if not exists idx_trips_tricycle_id on public.trips (tricycle_id);
create index if not exists idx_trips_route_id on public.trips (route_id);
create index if not exists idx_trips_status on public.trips (trip_status);
create index if not exists idx_trips_trip_start on public.trips (trip_start);
create index if not exists idx_trip_points_trip_id on public.trip_points (trip_id);
create index if not exists idx_trip_points_driver_id on public.trip_points (driver_id);
create index if not exists idx_trip_points_recorded_at on public.trip_points (recorded_at desc);
create index if not exists idx_passenger_scans_trip_id on public.passenger_scans (trip_id);
create index if not exists idx_passenger_scans_qr_id on public.passenger_scans (qr_id);
create index if not exists idx_passenger_scans_scanned_at on public.passenger_scans (scanned_at);
create index if not exists idx_reports_scan_id on public.reports (scan_id);
create index if not exists idx_reports_trip_id on public.reports (trip_id);
create index if not exists idx_reports_report_type_id on public.reports (report_type_id);
create index if not exists idx_reports_reported_at on public.reports (reported_at);
create index if not exists idx_reports_status on public.reports (status);
create index if not exists idx_report_media_report_id on public.report_media (report_id);
create index if not exists idx_violations_type_id on public.violations (violation_type_id);
create index if not exists idx_violations_trip_id on public.violations (trip_id);
create index if not exists idx_violations_report_id on public.violations (report_id);
create index if not exists idx_violations_driver_id on public.violations (driver_id);
create index if not exists idx_violations_tricycle_id on public.violations (tricycle_id);
create index if not exists idx_violations_status on public.violations (status);
create index if not exists idx_violations_detected_at on public.violations (detected_at);
create index if not exists idx_trip_route_points_trip on public.trip_route_points (trip_id);
create index if not exists idx_trip_routes_local_trip_recorded_at on public.trip_routes (local_trip_id, recorded_at);
create index if not exists idx_trip_routes_driver_recorded_at on public.trip_routes (driver_id, recorded_at desc);
create unique index if not exists uq_trip_routes_local_trip_point
on public.trip_routes (local_trip_id, driver_id, recorded_at, latitude, longitude);
create index if not exists idx_mobile_violations_driver_occurred_at_desc on public.mobile_violations (driver_id, occurred_at desc);
create index if not exists idx_mobile_violations_status on public.mobile_violations (status);
create index if not exists idx_mobile_violations_type on public.mobile_violations (type);
create index if not exists idx_violation_appeals_driver_submitted_at_desc on public.violation_appeals (driver_id, submitted_at desc);
create index if not exists idx_violation_appeals_violation on public.violation_appeals (violation_id);
create index if not exists idx_violation_proofs_driver_uploaded_at_desc on public.violation_proofs (driver_id, uploaded_at desc);
create index if not exists idx_violation_proofs_violation on public.violation_proofs (violation_id);
create index if not exists idx_admin_notification_reads_admin_read_at_desc
  on public.admin_notification_reads (admin_id, read_at desc);

do $$
begin
  drop index if exists public.uq_qr_codes_active_per_tricycle;

  with duplicate_active_qr_rows as (
    select
      qr_id
    from (
      select
        qr_id,
        row_number() over (
          partition by driver_id
          order by
            coalesce(issued_at, created_at) desc,
            qr_id desc
        ) as duplicate_rank
      from public.qr_codes
      where status = public.qr_status_from_text('active')
        and driver_id is not null
    ) ranked
    where duplicate_rank > 1
  )
  update public.qr_codes
  set
    status = public.qr_status_from_text('revoked'),
    expires_at = coalesce(expires_at, now())
  where qr_id in (select qr_id from duplicate_active_qr_rows);
exception
  when undefined_table then null;
end $$;

create unique index if not exists uq_qr_codes_active_per_driver
on public.qr_codes (driver_id)
where status = public.qr_status_from_text('active');

create unique index if not exists ux_active_appeal_per_violation
on public.violation_appeals (violation_id)
where status in (
  public.appeal_status_from_text('SUBMITTED'),
  public.appeal_status_from_text('UNDER_REVIEW')
);
-- ---------- Seed lookup data ----------
insert into public.report_types (code, label)
values
  ('harassment', 'Harassment'),
  ('reckless_driving', 'Reckless Driving'),
  ('fare_overpricing', 'Fare Overpricing'),
  ('other', 'Other')
on conflict (code) do nothing;

insert into public.violation_types (code, label)
values
  ('geofence_deviation', 'Geofence Deviation'),
  ('permit_expiration', 'Permit Expiration'),
  ('reckless_driving', 'Reckless Driving'),
  ('fare_overpricing', 'Fare Overpricing'),
  ('other', 'Other')
on conflict (code) do nothing;

-- ---------- RLS ----------
alter table public.barangays enable row level security;
alter table public.todas enable row level security;
alter table public.admin_accounts enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_locations enable row level security;
alter table public.tricycles enable row level security;
alter table public.routes enable row level security;
alter table public.qr_codes enable row level security;
alter table public.report_types enable row level security;
alter table public.violation_types enable row level security;
alter table public.trips enable row level security;
alter table public.trip_points enable row level security;
alter table public.passenger_scans enable row level security;
alter table public.reports enable row level security;
alter table public.report_media enable row level security;
alter table public.violations enable row level security;
alter table public.trip_route_points enable row level security;
alter table public.trip_routes enable row level security;
alter table public.mobile_violations enable row level security;
alter table public.violation_appeals enable row level security;
alter table public.violation_proofs enable row level security;
alter table public.admin_notification_reads enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'driver_locations'
      and policyname = 'authenticated_admins_can_read_driver_locations'
  ) then
    create policy authenticated_admins_can_read_driver_locations
    on public.driver_locations
    for select
    to authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'violation_proofs'
      and policyname = 'authenticated_can_read_violation_proofs'
  ) then
    create policy authenticated_can_read_violation_proofs
    on public.violation_proofs
    for select
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'violation_proofs'
      and policyname = 'authenticated_can_insert_violation_proofs'
  ) then
    create policy authenticated_can_insert_violation_proofs
    on public.violation_proofs
    for insert
    to anon, authenticated
    with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trip_points'
      and policyname = 'authenticated_can_read_trip_points'
  ) then
    create policy authenticated_can_read_trip_points
    on public.trip_points
    for select
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trip_points'
      and policyname = 'authenticated_can_insert_trip_points'
  ) then
    create policy authenticated_can_insert_trip_points
    on public.trip_points
    for insert
    to anon, authenticated
    with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trips'
      and policyname = 'authenticated_can_read_trips'
  ) then
    create policy authenticated_can_read_trips
    on public.trips
    for select
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trips'
      and policyname = 'authenticated_can_delete_trips'
  ) then
    create policy authenticated_can_delete_trips
    on public.trips
    for delete
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trip_route_points'
      and policyname = 'authenticated_can_read_trip_route_points'
  ) then
    create policy authenticated_can_read_trip_route_points
    on public.trip_route_points
    for select
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trip_routes'
      and policyname = 'authenticated_can_read_trip_routes'
  ) then
    create policy authenticated_can_read_trip_routes
    on public.trip_routes
    for select
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trip_routes'
      and policyname = 'authenticated_can_insert_trip_routes'
  ) then
    create policy authenticated_can_insert_trip_routes
    on public.trip_routes
    for insert
    to anon, authenticated
    with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trip_routes'
      and policyname = 'authenticated_can_update_trip_routes'
  ) then
    create policy authenticated_can_update_trip_routes
    on public.trip_routes
    for update
    to anon, authenticated
    using (true)
    with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trip_routes'
      and policyname = 'authenticated_can_delete_trip_routes'
  ) then
    create policy authenticated_can_delete_trip_routes
    on public.trip_routes
    for delete
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'mobile_violations'
      and policyname = 'authenticated_can_read_mobile_violations'
  ) then
    create policy authenticated_can_read_mobile_violations
    on public.mobile_violations
    for select
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'mobile_violations'
      and policyname = 'authenticated_can_insert_mobile_violations'
  ) then
    create policy authenticated_can_insert_mobile_violations
    on public.mobile_violations
    for insert
    to anon, authenticated
    with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'violation_appeals'
      and policyname = 'authenticated_can_read_violation_appeals'
  ) then
    create policy authenticated_can_read_violation_appeals
    on public.violation_appeals
    for select
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'violation_appeals'
      and policyname = 'authenticated_can_insert_violation_appeals'
  ) then
    create policy authenticated_can_insert_violation_appeals
    on public.violation_appeals
    for insert
    to anon, authenticated
    with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'violations'
      and policyname = 'authenticated_can_read_violations'
  ) then
    create policy authenticated_can_read_violations
    on public.violations
    for select
    to authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'driver_locations'
      and policyname = 'authenticated_can_insert_driver_locations'
  ) then
    create policy authenticated_can_insert_driver_locations
    on public.driver_locations
    for insert
    to authenticated, anon
    with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'driver_locations'
      and policyname = 'authenticated_can_update_driver_locations'
  ) then
    create policy authenticated_can_update_driver_locations
    on public.driver_locations
    for update
    to authenticated, anon
    using (true)
    with check (true);
  end if;
end $$;

-- ---------- Storage ----------
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('driver-avatars', 'driver-avatars', true)
  on conflict (id) do nothing;
exception
  when undefined_table then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_can_read_driver_avatars'
  ) then
    create policy public_can_read_driver_avatars
    on storage.objects
    for select
    to public
    using (bucket_id = 'driver-avatars');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_can_upload_driver_avatars'
  ) then
    create policy public_can_upload_driver_avatars
    on storage.objects
    for insert
    to anon, authenticated
    with check (bucket_id = 'driver-avatars');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_can_update_driver_avatars'
  ) then
    create policy public_can_update_driver_avatars
    on storage.objects
    for update
    to anon, authenticated
    using (bucket_id = 'driver-avatars')
    with check (bucket_id = 'driver-avatars');
  end if;
end $$;

-- ---------- Realtime + Grants ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.driver_locations;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.trips;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.trip_route_points;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.trip_routes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.mobile_violations;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.violation_appeals;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.violation_proofs;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.violations;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

grant execute on function public.upsert_driver_location(
  bigint,
  text,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  timestamptz
) to anon, authenticated;

grant execute on function public.set_driver_location_offline(bigint) to anon, authenticated;
grant execute on function public.set_driver_avatar(bigint, text) to anon, authenticated;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then null;
end $$;
