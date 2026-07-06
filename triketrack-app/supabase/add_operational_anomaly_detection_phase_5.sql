-- Phase 5 operational anomaly detection for the driver app Supabase project.
-- Run this in the same Supabase project used by both the driver app and admin dashboard.

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

create unique index if not exists uq_mobile_violations_dedupe_key
on public.mobile_violations(dedupe_key)
where dedupe_key is not null;

create index if not exists idx_trip_points_trip_recorded_at_desc
on public.trip_points(trip_id, recorded_at desc, point_id desc);

create index if not exists idx_mobile_violations_trip_type_occurred_at_desc
on public.mobile_violations(trip_id, type, occurred_at desc);

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
      v_distance_m := public.trip_point_distance_meters(v_previous.lat, v_previous.lng, new.lat, new.lng);
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

drop trigger if exists trg_trip_points_operational_anomalies on public.trip_points;
create trigger trg_trip_points_operational_anomalies
after insert on public.trip_points
for each row execute function public.detect_trip_point_operational_anomalies();
