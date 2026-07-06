
-- Run this in Supabase SQL Editor (SQL -> New query).
-- This is the merged rollup schema for the admin dashboard + mobile app.
-- Canonical source of truth: /home/rosie/trikettrack/services/backend/db/schema.sql
-- Keep this file aligned as a mobile setup mirror; do not add production-only schema here first.
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

  insert into storage.buckets (id, name, public)
  values ('violation-proofs', 'violation-proofs', true)
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
  create type public.mobile_violation_type as enum (
    'GEOFENCE_BOUNDARY',
    'ROUTE_DEVIATION',
    'UNAUTHORIZED_STOP',
    'GPS_SILENCE',
    'LONG_STOP',
    'TRIP_TIMEOUT',
    'SUSPICIOUS_SPEED',
    'REPEATED_GEOFENCE_BOUNDARY'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mobile_violation_type'
      and e.enumlabel = 'GPS_SILENCE'
  ) then
    alter type public.mobile_violation_type add value 'GPS_SILENCE';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mobile_violation_type'
      and e.enumlabel = 'LONG_STOP'
  ) then
    alter type public.mobile_violation_type add value 'LONG_STOP';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mobile_violation_type'
      and e.enumlabel = 'TRIP_TIMEOUT'
  ) then
    alter type public.mobile_violation_type add value 'TRIP_TIMEOUT';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mobile_violation_type'
      and e.enumlabel = 'SUSPICIOUS_SPEED'
  ) then
    alter type public.mobile_violation_type add value 'SUSPICIOUS_SPEED';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mobile_violation_type'
      and e.enumlabel = 'REPEATED_GEOFENCE_BOUNDARY'
  ) then
    alter type public.mobile_violation_type add value 'REPEATED_GEOFENCE_BOUNDARY';
  end if;
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

create or replace function public._geojson_ring_contains_lnglat(
  p_ring jsonb,
  p_lng double precision,
  p_lat double precision
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_inside boolean := false;
  v_count integer;
  v_i integer;
  v_j integer;
  v_xi double precision;
  v_yi double precision;
  v_xj double precision;
  v_yj double precision;
begin
  if p_ring is null or jsonb_typeof(p_ring) <> 'array' then
    return false;
  end if;

  v_count := jsonb_array_length(p_ring);
  if v_count < 4 then
    return false;
  end if;

  v_j := v_count - 1;
  for v_i in 0..(v_count - 1) loop
    v_xi := (p_ring -> v_i ->> 0)::double precision;
    v_yi := (p_ring -> v_i ->> 1)::double precision;
    v_xj := (p_ring -> v_j ->> 0)::double precision;
    v_yj := (p_ring -> v_j ->> 1)::double precision;

    if ((v_yi > p_lat) <> (v_yj > p_lat))
      and (
        p_lng < ((v_xj - v_xi) * (p_lat - v_yi) / nullif(v_yj - v_yi, 0)) + v_xi
      )
    then
      v_inside := not v_inside;
    end if;

    v_j := v_i;
  end loop;

  return v_inside;
exception
  when others then
    return false;
end;
$$;

create or replace function public._geojson_polygon_contains_lnglat(
  p_coordinates jsonb,
  p_lng double precision,
  p_lat double precision
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_ring_count integer;
  v_i integer;
begin
  if p_coordinates is null or jsonb_typeof(p_coordinates) <> 'array' then
    return null;
  end if;

  v_ring_count := jsonb_array_length(p_coordinates);
  if v_ring_count = 0 then
    return null;
  end if;

  if not public._geojson_ring_contains_lnglat(p_coordinates -> 0, p_lng, p_lat) then
    return false;
  end if;

  if v_ring_count > 1 then
    for v_i in 1..(v_ring_count - 1) loop
      if public._geojson_ring_contains_lnglat(p_coordinates -> v_i, p_lng, p_lat) then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

create or replace function public.geojson_contains_lnglat(
  p_geojson jsonb,
  p_lng double precision,
  p_lat double precision
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_type text;
  v_item jsonb;
  v_result boolean;
  v_seen_valid boolean := false;
begin
  if p_geojson is null or jsonb_typeof(p_geojson) <> 'object' then
    return null;
  end if;

  v_type := p_geojson ->> 'type';

  if v_type = 'Feature' then
    return public.geojson_contains_lnglat(p_geojson -> 'geometry', p_lng, p_lat);
  end if;

  if v_type = 'FeatureCollection' then
    for v_item in
      select value from jsonb_array_elements(coalesce(p_geojson -> 'features', '[]'::jsonb))
    loop
      v_result := public.geojson_contains_lnglat(v_item, p_lng, p_lat);
      if v_result is true then
        return true;
      end if;
      if v_result is not null then
        v_seen_valid := true;
      end if;
    end loop;

    if v_seen_valid then
      return false;
    end if;
    return null;
  end if;

  if v_type = 'Polygon' then
    return public._geojson_polygon_contains_lnglat(p_geojson -> 'coordinates', p_lng, p_lat);
  end if;

  if v_type = 'MultiPolygon' then
    for v_item in
      select value from jsonb_array_elements(coalesce(p_geojson -> 'coordinates', '[]'::jsonb))
    loop
      v_result := public._geojson_polygon_contains_lnglat(v_item, p_lng, p_lat);
      if v_result is true then
        return true;
      end if;
      if v_result is not null then
        v_seen_valid := true;
      end if;
    end loop;

    if v_seen_valid then
      return false;
    end if;
    return null;
  end if;

  return null;
end;
$$;

create or replace function public.create_geofence_violation_from_trip_point()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context record;
  v_inside boolean;
  v_bucket bigint;
  v_dedupe_key text;
  v_route_label text;
  v_location_label text;
begin
  if new.trip_id is null then
    return new;
  end if;

  select
    t.trip_id,
    t.driver_id,
    t.tricycle_id,
    r.route_id,
    r.origin,
    r.destination,
    r.geofence_geojson
  into v_context
  from public.trips t
  join public.routes r
    on r.route_id = t.route_id
  where t.trip_id = new.trip_id
    and t.driver_id = new.driver_id
  limit 1;

  if v_context.trip_id is null or v_context.geofence_geojson is null then
    return new;
  end if;

  v_inside := public.geojson_contains_lnglat(v_context.geofence_geojson, new.lng, new.lat);
  if v_inside is distinct from false then
    return new;
  end if;

  v_bucket := floor(extract(epoch from coalesce(new.recorded_at, now())) / 300)::bigint;
  v_dedupe_key := concat('geofence-boundary:', new.trip_id, ':', new.driver_id, ':', v_bucket);
  v_route_label := concat_ws(' -> ', v_context.origin, v_context.destination);
  v_location_label := concat(round(new.lat::numeric, 5)::text, ', ', round(new.lng::numeric, 5)::text);

  insert into public.mobile_violations (
    driver_id,
    trip_id,
    type,
    status,
    priority,
    occurred_at,
    title,
    latitude,
    longitude,
    location_label,
    details,
    dedupe_key
  )
  values (
    new.driver_id,
    new.trip_id,
    'GEOFENCE_BOUNDARY',
    'OPEN',
    'HIGH',
    coalesce(new.recorded_at, now()),
    'Geofence Boundary Violation',
    new.lat,
    new.lng,
    v_location_label,
    concat(
      'Backend geofence validation detected a trip point outside the authorized route boundary.',
      case when v_route_label <> '' then concat(' Route: ', v_route_label, '.') else '' end
    ),
    v_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

create or replace function public.trip_point_distance_meters(
  p_lat_a double precision,
  p_lng_a double precision,
  p_lat_b double precision,
  p_lng_b double precision
)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * asin(
    least(
      1,
      sqrt(
        power(sin(radians((p_lat_b - p_lat_a) / 2)), 2) +
        cos(radians(p_lat_a)) * cos(radians(p_lat_b)) *
        power(sin(radians((p_lng_b - p_lng_a) / 2)), 2)
      )
    )
  );
$$;

create or replace function public.insert_mobile_operational_anomaly(
  p_driver_id bigint,
  p_trip_id bigint,
  p_type public.mobile_violation_type,
  p_priority public.mobile_violation_priority,
  p_occurred_at timestamptz,
  p_title text,
  p_lat double precision,
  p_lng double precision,
  p_location_label text,
  p_details text,
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  insert into public.mobile_violations (
    driver_id,
    trip_id,
    type,
    status,
    priority,
    occurred_at,
    title,
    latitude,
    longitude,
    location_label,
    details,
    dedupe_key
  )
  values (
    p_driver_id,
    p_trip_id,
    p_type,
    'OPEN',
    p_priority,
    coalesce(p_occurred_at, now()),
    p_title,
    p_lat,
    p_lng,
    p_location_label,
    p_details,
    p_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

create or replace function public.detect_trip_point_operational_anomalies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_previous record;
  v_gap_seconds double precision;
  v_distance_m double precision;
  v_speed_mps double precision;
  v_bucket bigint;
  v_point_count integer;
  v_window_start timestamptz;
  v_max_distance_m double precision;
  v_boundary_count integer;
  v_location_label text;
begin
  if new.trip_id is null then
    return new;
  end if;

  select t.trip_id, t.driver_id, t.trip_start, t.trip_status
  into v_trip
  from public.trips t
  where t.trip_id = new.trip_id
    and t.driver_id = new.driver_id
  limit 1;

  if v_trip.trip_id is null or lower(v_trip.trip_status::text) <> 'ongoing' then
    return new;
  end if;

  v_location_label := concat(round(new.lat::numeric, 5)::text, ', ', round(new.lng::numeric, 5)::text);

  select tp.recorded_at, tp.lat, tp.lng
  into v_previous
  from public.trip_points tp
  where tp.trip_id = new.trip_id
    and tp.point_id <> new.point_id
    and tp.recorded_at < new.recorded_at
  order by tp.recorded_at desc, tp.point_id desc
  limit 1;

  if v_previous.recorded_at is not null then
    v_gap_seconds := extract(epoch from (new.recorded_at - v_previous.recorded_at));
    if v_gap_seconds between 10 and 1800 then
      v_distance_m := public.trip_point_distance_meters(
        v_previous.lat,
        v_previous.lng,
        new.lat,
        new.lng
      );
      v_speed_mps := v_distance_m / nullif(v_gap_seconds, 0);

      if v_distance_m >= 100 and v_speed_mps > 22.22 then
        v_bucket := floor(extract(epoch from new.recorded_at) / 300)::bigint;
        perform public.insert_mobile_operational_anomaly(
          new.driver_id,
          new.trip_id,
          'SUSPICIOUS_SPEED',
          'MEDIUM',
          new.recorded_at,
          'Suspicious Movement Speed',
          new.lat,
          new.lng,
          v_location_label,
          concat(
            'GPS points imply about ',
            round((v_speed_mps * 3.6)::numeric, 1)::text,
            ' km/h over ',
            round(v_distance_m::numeric, 0)::text,
            ' meters. Review the trip if this does not match actual movement.'
          ),
          concat('suspicious-speed:', new.trip_id, ':', new.driver_id, ':', v_bucket)
        );
      end if;
    end if;
  end if;

  select
    count(*)::integer,
    min(tp.recorded_at),
    max(public.trip_point_distance_meters(tp.lat, tp.lng, new.lat, new.lng))
  into v_point_count, v_window_start, v_max_distance_m
  from public.trip_points tp
  where tp.trip_id = new.trip_id
    and tp.recorded_at >= new.recorded_at - interval '10 minutes'
    and tp.recorded_at <= new.recorded_at;

  if v_point_count >= 3
    and v_window_start <= new.recorded_at - interval '10 minutes'
    and coalesce(v_max_distance_m, 999999) <= 30 then
    v_bucket := floor(extract(epoch from new.recorded_at) / 900)::bigint;
    perform public.insert_mobile_operational_anomaly(
      new.driver_id,
      new.trip_id,
      'LONG_STOP',
      'MEDIUM',
      new.recorded_at,
      'Long Stop During Trip',
      new.lat,
      new.lng,
      v_location_label,
      'The driver stayed within about 30 meters for at least 10 minutes during an ongoing trip.',
      concat('long-stop:', new.trip_id, ':', new.driver_id, ':', v_bucket)
    );
  end if;

  select count(*)::integer
  into v_boundary_count
  from public.mobile_violations mv
  where mv.trip_id = new.trip_id
    and mv.driver_id = new.driver_id
    and mv.type = 'GEOFENCE_BOUNDARY'
    and mv.occurred_at >= new.recorded_at - interval '15 minutes';

  if v_boundary_count >= 3 then
    v_bucket := floor(extract(epoch from new.recorded_at) / 900)::bigint;
    perform public.insert_mobile_operational_anomaly(
      new.driver_id,
      new.trip_id,
      'REPEATED_GEOFENCE_BOUNDARY',
      'HIGH',
      new.recorded_at,
      'Repeated Geofence Boundary Issues',
      new.lat,
      new.lng,
      v_location_label,
      concat(v_boundary_count::text, ' geofence boundary issues were detected within 15 minutes.'),
      concat('repeated-geofence-boundary:', new.trip_id, ':', new.driver_id, ':', v_bucket)
    );
  end if;

  return new;
end;
$$;

create or replace function public.detect_trip_operational_anomalies()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_inserted_count integer := 0;
  v_inserted boolean;
  v_bucket bigint;
  v_location_label text;
begin
  for v_trip in
    select
      t.trip_id,
      t.driver_id,
      t.trip_start,
      lp.recorded_at as latest_recorded_at,
      lp.lat as latest_lat,
      lp.lng as latest_lng
    from public.trips t
    left join lateral (
      select tp.recorded_at, tp.lat, tp.lng
      from public.trip_points tp
      where tp.trip_id = t.trip_id
      order by tp.recorded_at desc, tp.point_id desc
      limit 1
    ) lp on true
    where lower(t.trip_status::text) = 'ongoing'
  loop
    v_location_label := case
      when v_trip.latest_lat is null or v_trip.latest_lng is null then null
      else concat(round(v_trip.latest_lat::numeric, 5)::text, ', ', round(v_trip.latest_lng::numeric, 5)::text)
    end;

    if v_trip.trip_start <= now() - interval '2 hours'
      and v_trip.latest_recorded_at is not null
      and not exists (
        select 1
        from public.mobile_violations mv
        where mv.trip_id = v_trip.trip_id
          and mv.driver_id = v_trip.driver_id
          and mv.type = 'TRIP_TIMEOUT'
          and mv.status in ('OPEN', 'UNDER_REVIEW')
      ) then
      v_inserted := public.insert_mobile_operational_anomaly(
        v_trip.driver_id,
        v_trip.trip_id,
        'TRIP_TIMEOUT',
        'HIGH',
        now(),
        'Trip Running Too Long',
        v_trip.latest_lat,
        v_trip.latest_lng,
        v_location_label,
        'The trip has been ongoing for more than 2 hours without being completed.',
        concat('trip-timeout:', v_trip.trip_id, ':', v_trip.driver_id)
      );
      if v_inserted then
        v_inserted_count := v_inserted_count + 1;
      end if;
    end if;

    if v_trip.trip_start <= now() - interval '5 minutes'
      and (
        v_trip.latest_recorded_at is null
        or v_trip.latest_recorded_at <= now() - interval '5 minutes'
      )
      and not exists (
        select 1
        from public.mobile_violations mv
        where mv.trip_id = v_trip.trip_id
          and mv.driver_id = v_trip.driver_id
          and mv.type = 'GPS_SILENCE'
          and mv.status in ('OPEN', 'UNDER_REVIEW')
      ) then
      v_inserted := public.insert_mobile_operational_anomaly(
        v_trip.driver_id,
        v_trip.trip_id,
        'GPS_SILENCE',
        'MEDIUM',
        coalesce(v_trip.latest_recorded_at, now()),
        'GPS Updates Paused',
        v_trip.latest_lat,
        v_trip.latest_lng,
        v_location_label,
        'No GPS point has been received for at least 5 minutes while the trip is still ongoing.',
        concat('gps-silence:', v_trip.trip_id, ':', v_trip.driver_id)
      );
      if v_inserted then
        v_inserted_count := v_inserted_count + 1;
      end if;
    end if;
  end loop;

  return v_inserted_count;
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
  default_fare_amount numeric(10, 2),
  status public.entity_status not null default public.entity_status_from_text('active'),
  created_at timestamptz not null default now(),
  constraint route_default_fare_check check (default_fare_amount is null or default_fare_amount >= 0),
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

create table if not exists public.driver_password_reset_requests (
  request_id bigint generated always as identity primary key,
  driver_id bigint not null references public.drivers(driver_id) on delete cascade,
  driver_code text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by bigint references public.admin_accounts(admin_id) on delete set null,
  temporary_password_hash text,
  temporary_password text,
  temporary_password_used_at timestamptz,
  expires_at timestamptz,
  device_push_token text,
  device_platform text,
  push_sent_at timestamptz,
  push_error text,
  resolved_at timestamptz,
  constraint driver_password_reset_requests_status_check
    check (status in ('pending', 'approved', 'denied', 'completed', 'expired'))
);

alter table public.drivers add column if not exists contact_no text;
alter table public.drivers add column if not exists avatar_url text;
alter table public.drivers add column if not exists password_hash text;
alter table public.drivers add column if not exists updated_at timestamptz not null default now();
alter table public.drivers add column if not exists tricycle_id bigint;
alter table public.drivers add column if not exists qr_id bigint;
alter table public.driver_password_reset_requests add column if not exists temporary_password text;
alter table public.driver_password_reset_requests add column if not exists expires_at timestamptz;
alter table public.driver_password_reset_requests add column if not exists device_push_token text;
alter table public.driver_password_reset_requests add column if not exists device_platform text;
alter table public.driver_password_reset_requests add column if not exists push_sent_at timestamptz;
alter table public.driver_password_reset_requests add column if not exists push_error text;

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
  trip_id bigint,
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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'driver_locations_trip_id_fkey'
      and conrelid = 'public.driver_locations'::regclass
  ) then
    alter table public.driver_locations
      add constraint driver_locations_trip_id_fkey
      foreign key (trip_id) references public.trips(trip_id) on delete set null;
  end if;
exception
  when undefined_table then null;
end $$;

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
  trip_id bigint references public.trips(trip_id) on delete set null,
  driver_id bigint not null references public.drivers(driver_id) on delete cascade,
  qr_id bigint not null references public.qr_codes(qr_id) on delete restrict,
  scanned_at timestamptz not null default now(),
  device_info jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  report_id bigint generated always as identity primary key,
  scan_id bigint not null references public.passenger_scans(scan_id) on delete cascade,
  trip_id bigint references public.trips(trip_id) on delete set null,
  driver_id bigint not null references public.drivers(driver_id) on delete cascade,
  qr_id bigint not null references public.qr_codes(qr_id) on delete restrict,
  report_type_id bigint not null references public.report_types(report_type_id) on delete restrict,
  source text not null default 'qr_web_form',
  passenger_name text,
  passenger_contact text,
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
  latitude double precision,
  longitude double precision,
  location_label text,
  dedupe_key text,
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
  dedupe_key text,
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
  admin_viewed_at timestamptz,
  admin_viewed_by_admin_id bigint references public.admin_accounts(admin_id) on delete set null,
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

create table if not exists public.admin_audit_logs (
  audit_id bigint generated always as identity primary key,
  admin_id bigint references public.admin_accounts(admin_id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb,
  created_at timestamptz not null default now()
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

drop trigger if exists trg_trip_points_geofence_violation on public.trip_points;
create trigger trg_trip_points_geofence_violation
after insert on public.trip_points
for each row execute function public.create_geofence_violation_from_trip_point();

drop trigger if exists trg_trip_points_operational_anomalies on public.trip_points;
create trigger trg_trip_points_operational_anomalies
after insert on public.trip_points
for each row execute function public.detect_trip_point_operational_anomalies();

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

drop function if exists public.request_driver_password_reset(text);
drop function if exists public.request_driver_password_reset(text, text, text);
create or replace function public.request_driver_password_reset(
  p_driver_code text,
  p_device_push_token text default null,
  p_device_platform text default null
)
returns table (
  request_id bigint,
  driver_id bigint,
  driver_code text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_driver_id bigint;
  target_driver_code text;
  existing_request_id bigint;
  existing_request_driver_id bigint;
  existing_request_driver_code text;
  existing_request_status text;
begin
  select d.driver_id, coalesce(d.driver_code, d.driver_id::text) as driver_code
    into target_driver_id, target_driver_code
  from public.drivers d
  where d.status = public.entity_status_from_text('active')
    and upper(coalesce(d.driver_code, d.driver_id::text)) = upper(p_driver_code)
  limit 1;

  if target_driver_id is null then
    return;
  end if;

  select r.request_id, r.driver_id, r.driver_code, r.status
    into existing_request_id, existing_request_driver_id, existing_request_driver_code, existing_request_status
  from public.driver_password_reset_requests r
  where r.driver_id = target_driver_id
    and r.status in ('pending', 'approved')
    and (r.expires_at is null or r.expires_at >= now())
  order by r.requested_at desc
  limit 1;

  if existing_request_id is not null then
    update public.driver_password_reset_requests
    set
      device_push_token = coalesce(nullif(trim(p_device_push_token), ''), device_push_token),
      device_platform = coalesce(nullif(trim(p_device_platform), ''), device_platform)
    where request_id = existing_request_id;

    request_id := existing_request_id;
    driver_id := existing_request_driver_id;
    driver_code := existing_request_driver_code;
    status := existing_request_status;
    return next;
    return;
  end if;

  insert into public.driver_password_reset_requests (
    driver_id,
    driver_code,
    device_push_token,
    device_platform
  )
  values (
    target_driver_id,
    target_driver_code,
    nullif(trim(p_device_push_token), ''),
    nullif(trim(p_device_platform), '')
  )
  returning
    driver_password_reset_requests.request_id,
    driver_password_reset_requests.driver_id,
    driver_password_reset_requests.driver_code,
    driver_password_reset_requests.status
  into request_id, driver_id, driver_code, status;

  return next;
end;
$$;

drop function if exists public.get_driver_password_reset_status(text);
create or replace function public.get_driver_password_reset_status(p_driver_code text)
returns table (
  request_id bigint,
  driver_id bigint,
  driver_code text,
  status text,
  temporary_password text,
  requested_at timestamptz,
  approved_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_driver_id bigint;
begin
  select d.driver_id
    into target_driver_id
  from public.drivers d
  where d.status = public.entity_status_from_text('active')
    and upper(coalesce(d.driver_code, d.driver_id::text)) = upper(p_driver_code)
  limit 1;

  if target_driver_id is null then
    return;
  end if;

  update public.driver_password_reset_requests r
  set
    status = 'expired',
    temporary_password = null,
    temporary_password_hash = null,
    resolved_at = coalesce(r.resolved_at, now())
  where r.driver_id = target_driver_id
    and r.status = 'approved'
    and r.expires_at is not null
    and r.expires_at < now();

  return query
  select
    r.request_id,
    r.driver_id,
    r.driver_code,
    r.status,
    case
      when r.status = 'approved'
        and r.temporary_password_used_at is null
        and (r.expires_at is null or r.expires_at >= now())
        then r.temporary_password
      else null::text
    end as temporary_password,
    r.requested_at,
    r.approved_at,
    r.expires_at
  from public.driver_password_reset_requests r
  where r.driver_id = target_driver_id
    and r.status in ('pending', 'approved', 'denied', 'expired')
  order by r.requested_at desc
  limit 1;
end;
$$;

drop function if exists public.complete_driver_password_reset(text, text, text);
create or replace function public.complete_driver_password_reset(
  p_driver_code text,
  p_temporary_password text,
  p_new_password text
)
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
declare
  target_driver_id bigint;
  reset_request_id bigint;
begin
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters long.';
  end if;

  select d.driver_id
    into target_driver_id
  from public.drivers d
  where d.status = public.entity_status_from_text('active')
    and upper(coalesce(d.driver_code, d.driver_id::text)) = upper(p_driver_code)
  limit 1;

  if target_driver_id is null then
    return;
  end if;

  select r.request_id
    into reset_request_id
  from public.driver_password_reset_requests r
  where r.driver_id = target_driver_id
    and r.status = 'approved'
    and r.temporary_password_hash is not null
    and r.temporary_password_used_at is null
    and (r.expires_at is null or r.expires_at >= now())
    and r.temporary_password_hash = extensions.crypt(p_temporary_password, r.temporary_password_hash)
  order by r.approved_at desc nulls last, r.requested_at desc
  limit 1;

  if reset_request_id is null then
    raise exception 'Invalid or expired temporary reset password.';
  end if;

  update public.drivers d
  set
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    updated_at = now()
  where d.driver_id = target_driver_id;

  update public.driver_password_reset_requests r
  set
    status = 'completed',
    temporary_password = null,
    temporary_password_hash = null,
    temporary_password_used_at = now(),
    resolved_at = now()
  where r.request_id = reset_request_id;

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
  where d.driver_id = target_driver_id;
end;
$$;

drop function if exists public.verify_driver_temporary_password(text, text);
create or replace function public.verify_driver_temporary_password(
  p_driver_code text,
  p_temporary_password text
)
returns table (
  request_id bigint,
  driver_id bigint,
  driver_code text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_driver_id bigint;
begin
  select d.driver_id
    into target_driver_id
  from public.drivers d
  where d.status = public.entity_status_from_text('active')
    and upper(coalesce(d.driver_code, d.driver_id::text)) = upper(p_driver_code)
  limit 1;

  if target_driver_id is null then
    return;
  end if;

  select r.request_id, r.driver_id, r.driver_code, r.status
    into request_id, driver_id, driver_code, status
  from public.driver_password_reset_requests r
  where r.driver_id = target_driver_id
    and r.status = 'approved'
    and r.temporary_password_hash is not null
    and r.temporary_password_used_at is null
    and (r.expires_at is null or r.expires_at >= now())
    and r.temporary_password_hash = extensions.crypt(p_temporary_password, r.temporary_password_hash)
  order by r.approved_at desc nulls last, r.requested_at desc
  limit 1;

  if request_id is null then
    return;
  end if;

  return next;
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
  v_default_fare numeric(10, 2);
begin
  select d.tricycle_id, d.toda_id, r.route_id, r.default_fare_amount
  into v_tricycle_id, v_toda_id, v_route_id, v_default_fare
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
    values (v_toda_id, 'Obrero', 'Route', public.entity_status_from_text('active'))
    on conflict (toda_id, origin, destination) do update
      set status = public.entity_status_from_text('active')
    returning route_id, default_fare_amount into v_route_id, v_default_fare;
  end if;

  if v_route_id is null then
    select r.route_id, r.default_fare_amount
    into v_route_id, v_default_fare
    from public.routes r
    where r.status = public.entity_status_from_text('active')
    order by r.route_id asc
    limit 1;
  end if;

  if v_route_id is null then
    raise exception 'Driver % has no route available for testing.', p_driver_id;
  end if;

  insert into public.trips (driver_id, tricycle_id, route_id, trip_start, trip_status, fare_amount, duration_minutes)
  values (p_driver_id, v_tricycle_id, v_route_id, now(), public.trip_status_from_text('ongoing'), coalesce(v_default_fare, 0), 0)
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
create index if not exists idx_driver_password_reset_requests_driver_requested_at_desc
  on public.driver_password_reset_requests (driver_id, requested_at desc);
create index if not exists idx_driver_password_reset_requests_status_requested_at_desc
  on public.driver_password_reset_requests (status, requested_at desc);
create unique index if not exists idx_driver_password_reset_requests_one_pending
  on public.driver_password_reset_requests (driver_id)
  where status = 'pending';
create index if not exists idx_driver_locations_trip_id on public.driver_locations (trip_id);
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
create index if not exists idx_trip_points_trip_recorded_at_desc
on public.trip_points (trip_id, recorded_at desc, point_id desc);
create index if not exists idx_passenger_scans_trip_id on public.passenger_scans (trip_id);
create index if not exists idx_passenger_scans_driver_id on public.passenger_scans (driver_id);
create index if not exists idx_passenger_scans_qr_id on public.passenger_scans (qr_id);
create index if not exists idx_passenger_scans_scanned_at on public.passenger_scans (scanned_at);
create index if not exists idx_reports_scan_id on public.reports (scan_id);
create index if not exists idx_reports_trip_id on public.reports (trip_id);
create index if not exists idx_reports_driver_id on public.reports (driver_id);
create index if not exists idx_reports_qr_id on public.reports (qr_id);
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
create unique index if not exists uq_violations_dedupe_key
on public.violations (dedupe_key)
where dedupe_key is not null;
create index if not exists idx_trip_route_points_trip on public.trip_route_points (trip_id);
create index if not exists idx_trip_routes_local_trip_recorded_at on public.trip_routes (local_trip_id, recorded_at);
create index if not exists idx_trip_routes_driver_recorded_at on public.trip_routes (driver_id, recorded_at desc);
create unique index if not exists uq_trip_routes_local_trip_point
on public.trip_routes (local_trip_id, driver_id, recorded_at, latitude, longitude);
create index if not exists idx_mobile_violations_driver_occurred_at_desc on public.mobile_violations (driver_id, occurred_at desc);
create index if not exists idx_mobile_violations_status on public.mobile_violations (status);
create index if not exists idx_mobile_violations_type on public.mobile_violations (type);
create index if not exists idx_mobile_violations_trip_type_occurred_at_desc
on public.mobile_violations (trip_id, type, occurred_at desc);
create unique index if not exists uq_mobile_violations_dedupe_key
on public.mobile_violations (dedupe_key)
where dedupe_key is not null;
create index if not exists idx_violation_appeals_driver_submitted_at_desc on public.violation_appeals (driver_id, submitted_at desc);
create index if not exists idx_violation_appeals_violation on public.violation_appeals (violation_id);
create index if not exists idx_violation_appeals_admin_viewed_at on public.violation_appeals (admin_viewed_at desc nulls last);
create index if not exists idx_violation_appeals_admin_viewed_by on public.violation_appeals (admin_viewed_by_admin_id);
create index if not exists idx_violation_proofs_driver_uploaded_at_desc on public.violation_proofs (driver_id, uploaded_at desc);
create index if not exists idx_violation_proofs_violation on public.violation_proofs (violation_id);
create index if not exists idx_admin_notification_reads_admin_read_at_desc
  on public.admin_notification_reads (admin_id, read_at desc);
create index if not exists idx_admin_audit_logs_admin_created_at
  on public.admin_audit_logs (admin_id, created_at desc);

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
alter table public.driver_password_reset_requests enable row level security;
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
alter table public.admin_audit_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'driver_password_reset_requests'
      and policyname = 'authenticated_can_read_driver_password_reset_requests'
  ) then
    create policy authenticated_can_read_driver_password_reset_requests
    on public.driver_password_reset_requests
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

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_can_read_violation_proofs'
  ) then
    create policy public_can_read_violation_proofs
    on storage.objects
    for select
    to public
    using (bucket_id = 'violation-proofs');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_can_upload_violation_proofs'
  ) then
    create policy public_can_upload_violation_proofs
    on storage.objects
    for insert
    to anon, authenticated
    with check (bucket_id = 'violation-proofs');
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
grant execute on function public.request_driver_password_reset(text, text, text) to anon, authenticated;
grant execute on function public.get_driver_password_reset_status(text) to anon, authenticated;
grant execute on function public.complete_driver_password_reset(text, text, text) to anon, authenticated;
grant execute on function public.verify_driver_temporary_password(text, text) to anon, authenticated;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then null;
end $$;
