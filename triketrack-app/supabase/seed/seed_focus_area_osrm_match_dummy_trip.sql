-- Seed one long focused dummy trip inside the Obrero geofence.
-- This is intentionally stored as OSRM map matching metadata:
--   routeMatchSummary.provider = 'osrm-match'
--
-- It does not call OSRM at seed time. The saved route geometry below is
-- stored as a map-matched result so the app can display one long in-geofence
-- dummy trip that touches the Amethyst / Pearl side, the interior streets, and
-- the northern Obrero streets while staying inside the app geofence.

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
alter table public.trip_points add column if not exists heading double precision;
alter table public.trip_points add column if not exists accuracy double precision;
alter table public.trip_points add column if not exists provider text;

do $$
declare
  v_local_trip_id text := 'DUMMY-OSRM-MATCH-OBRERO-LONG-01';
  v_existing_trip_id bigint;
  v_trip_id bigint;
  v_driver_id bigint;
  v_tricycle_id bigint;
  v_toda_id bigint;
  v_route_id bigint;
  v_started_at timestamptz := now() - interval '9 minutes';
  v_ended_at timestamptz := now();
  v_matched_count integer;
  v_raw_count integer;
  v_distance_meters numeric := 1850.0;
begin
  create temp table if not exists pg_temp.dummy_obrero_matched_points (
    idx integer primary key,
    lat double precision not null,
    lng double precision not null
  ) on commit drop;

  create temp table if not exists pg_temp.dummy_obrero_raw_points (
    idx integer primary key,
    lat double precision not null,
    lng double precision not null,
    speed double precision,
    heading double precision,
    accuracy double precision
  ) on commit drop;

  truncate table pg_temp.dummy_obrero_matched_points;
  truncate table pg_temp.dummy_obrero_raw_points;

  insert into pg_temp.dummy_obrero_matched_points (idx, lat, lng)
  values
    (0, 7.081744, 125.613645),
    (1, 7.082122, 125.613925),
    (2, 7.082245, 125.614016),
    (3, 7.082174, 125.614120),
    (4, 7.082087, 125.614244),
    (5, 7.081995, 125.614372),
    (6, 7.081900, 125.614505),
    (7, 7.081815, 125.614620),
    (8, 7.081715, 125.614755),
    (9, 7.081610, 125.614894),
    (10, 7.081508, 125.615030),
    (11, 7.081410, 125.615162),
    (12, 7.081315, 125.615294),
    (13, 7.081245, 125.615395),
    (14, 7.081330, 125.615488),
    (15, 7.081455, 125.615598),
    (16, 7.081585, 125.615713),
    (17, 7.081715, 125.615828),
    (18, 7.081842, 125.615942),
    (19, 7.081990, 125.616075),
    (20, 7.082110, 125.616182),
    (21, 7.082229, 125.616292),
    (22, 7.082348, 125.616402),
    (23, 7.082470, 125.616520),
    (24, 7.082640, 125.616675),
    (25, 7.082825, 125.616842),
    (26, 7.083010, 125.617010),
    (27, 7.083210, 125.617190),
    (28, 7.083420, 125.617385),
    (29, 7.083640, 125.617585),
    (30, 7.083875, 125.617795),
    (31, 7.084100, 125.618000),
    (32, 7.084330, 125.618215),
    (33, 7.084555, 125.618430),
    (34, 7.084785, 125.618650),
    (35, 7.085015, 125.618870),
    (36, 7.085245, 125.619090),
    (37, 7.085475, 125.619315),
    (38, 7.085705, 125.619540),
    (39, 7.085930, 125.619770),
    (40, 7.086155, 125.620000),
    (41, 7.086385, 125.620235),
    (42, 7.086615, 125.620470),
    (43, 7.086850, 125.620705),
    (44, 7.087085, 125.620945),
    (45, 7.087320, 125.621185),
    (46, 7.087480, 125.620820),
    (47, 7.087640, 125.620450),
    (48, 7.087800, 125.620080),
    (49, 7.087965, 125.619705),
    (50, 7.088120, 125.619340),
    (51, 7.088280, 125.618980),
    (52, 7.088450, 125.618620),
    (53, 7.088620, 125.618260),
    (54, 7.088790, 125.617905),
    (55, 7.088960, 125.617550),
    (56, 7.089120, 125.617200),
    (57, 7.088840, 125.616965),
    (58, 7.088555, 125.616730),
    (59, 7.088270, 125.616500),
    (60, 7.087985, 125.616270),
    (61, 7.087700, 125.616040),
    (62, 7.087410, 125.615810),
    (63, 7.087120, 125.615580),
    (64, 7.086835, 125.615350),
    (65, 7.086540, 125.615120),
    (66, 7.086250, 125.614895),
    (67, 7.085960, 125.614670),
    (68, 7.085670, 125.614445),
    (69, 7.085380, 125.614220),
    (70, 7.085090, 125.613995),
    (71, 7.084800, 125.613770),
    (72, 7.084510, 125.613545),
    (73, 7.084220, 125.613320);

  insert into pg_temp.dummy_obrero_raw_points (idx, lat, lng, speed, heading, accuracy)
  values
    (0, 7.081750, 125.613650, 6.0, 36, 5),
    (1, 7.081455, 125.615598, 10.2, 132, 5),
    (2, 7.082470, 125.616520, 12.4, 42, 4),
    (3, 7.084100, 125.618000, 14.2, 42, 5),
    (4, 7.085930, 125.619770, 15.0, 43, 6),
    (5, 7.087320, 125.621185, 12.6, 42, 6),
    (6, 7.088120, 125.619340, 11.0, 294, 5),
    (7, 7.089120, 125.617200, 9.4, 294, 5),
    (8, 7.087700, 125.616040, 13.2, 219, 7),
    (9, 7.086250, 125.614895, 12.8, 218, 6),
    (10, 7.084220, 125.613320, 0.0, 218, 4);

  select count(*) into v_matched_count from pg_temp.dummy_obrero_matched_points;
  select count(*) into v_raw_count from pg_temp.dummy_obrero_raw_points;

  select d.driver_id, d.tricycle_id, d.toda_id
  into v_driver_id, v_tricycle_id, v_toda_id
  from public.drivers d
  where d.driver_code = 'D-001'
  limit 1;

  if v_driver_id is null then
    raise exception 'Driver D-001 was not found.';
  end if;

  if v_tricycle_id is null then
    raise exception 'Driver D-001 does not have a tricycle assigned.';
  end if;

  select tr.trip_id
  into v_existing_trip_id
  from public.trip_routes tr
  where tr.local_trip_id = v_local_trip_id
    and tr.trip_id is not null
  order by tr.recorded_at desc
  limit 1;

  delete from public.trip_routes
  where local_trip_id = v_local_trip_id
     or (v_existing_trip_id is not null and trip_id = v_existing_trip_id);

  if v_existing_trip_id is not null then
    delete from public.trip_route_points where trip_id = v_existing_trip_id;
    delete from public.trip_points where trip_id = v_existing_trip_id;
    delete from public.trips where trip_id = v_existing_trip_id;
  end if;

  select greatest(coalesce(max(t.trip_id), 0) + 1, 9901)
  into v_trip_id
  from public.trips t;

  select r.route_id
  into v_route_id
  from public.routes r
  where r.toda_id = v_toda_id
    and r.status::text = 'active'
  order by
    case
      when r.origin ilike '%obrero%'
        or r.origin ilike '%amethyst%'
        or r.origin ilike '%pearl%'
        or r.destination ilike '%obrero%'
        or r.destination ilike '%amethyst%'
        or r.destination ilike '%pearl%' then 0
      else 1
    end,
    r.route_id asc
  limit 1;

  if v_route_id is null then
    insert into public.routes (toda_id, origin, destination, status)
    values (
      v_toda_id,
      'Obrero Geofence Loop',
      'Obrero Interior Streets',
      'active'::public.entity_status
    )
    on conflict (toda_id, origin, destination) do update
      set status = 'active'::public.entity_status
    returning route_id into v_route_id;
  end if;

  insert into public.trips (
    trip_id,
    driver_id,
    tricycle_id,
    route_id,
    trip_start,
    trip_end,
    duration_minutes,
    fare_amount,
    trip_status,
    start_location_raw,
    start_location_matched,
    end_location_raw,
    end_location_matched,
    start_display_name,
    end_display_name,
    start_coordinate,
    end_coordinate,
    dashed_start_connector,
    dashed_end_connector,
    route_trace_geojson,
    trip_metrics,
    gps_quality_summary,
    raw_gps_point_count,
    matched_point_count,
    offline_segments_count,
    sync_status
  )
  overriding system value
  values (
    v_trip_id,
    v_driver_id,
    v_tricycle_id,
    v_route_id,
    v_started_at,
    v_ended_at,
    9,
    10.00,
    'completed'::public.trip_status,
    jsonb_build_object('latitude', 7.081750, 'longitude', 125.613650),
    jsonb_build_object('latitude', 7.081744, 'longitude', 125.613645),
    jsonb_build_object('latitude', 7.084220, 'longitude', 125.613320),
    jsonb_build_object('latitude', 7.084220, 'longitude', 125.613320),
    'Obrero geofence, Amethyst side',
    'Obrero geofence, interior streets',
    jsonb_build_object('latitude', 7.081744, 'longitude', 125.613645),
    jsonb_build_object('latitude', 7.084220, 'longitude', 125.613320),
    '[]'::jsonb,
    '[]'::jsonb,
    (
      select jsonb_build_object(
        'type', 'LineString',
        'coordinates', jsonb_agg(jsonb_build_array(p.lng, p.lat) order by p.idx)
      )
      from pg_temp.dummy_obrero_matched_points p
    ),
    jsonb_build_object(
      'routeMatchSummary', jsonb_build_object(
        'provider', 'osrm-match',
        'confidence', 0.98,
        'roadNames', jsonb_build_array(
          'Amethyst Street',
          'Pearl Street',
          'Obrero Interior Streets',
          'Garnet Street',
          'Sta. Ana Avenue'
        ),
        'distanceMeters', v_distance_meters,
        'durationSeconds', 540.0,
        'inputPointCount', v_raw_count,
        'matchedPointCount', v_matched_count
      ),
      'averageSpeedKph', 12.3,
      'maxSpeedKph', 18.0,
      'idleDurationSeconds', 28
    ),
    jsonb_build_object(
      'sampleCount', v_raw_count,
      'averageAccuracyMeters', 5.3,
      'worstAccuracyMeters', 7,
      'bestAccuracyMeters', 4,
      'confidence', 'high'
    ),
    v_raw_count,
    v_matched_count,
    0,
    'SYNCED'
  );

  insert into public.trip_route_points (trip_id, idx, latitude, longitude)
  select v_trip_id, p.idx, p.lat, p.lng
  from pg_temp.dummy_obrero_matched_points p
  order by p.idx;

  insert into public.trip_routes (
    local_trip_id,
    trip_id,
    driver_id,
    latitude,
    longitude,
    recorded_at
  )
  select
    v_local_trip_id,
    v_trip_id,
    v_driver_id,
    p.lat,
    p.lng,
    case
      when p.idx = v_matched_count - 1 then v_ended_at
      else v_started_at + (p.idx * interval '7 seconds')
    end
  from pg_temp.dummy_obrero_matched_points p
  order by p.idx;

  insert into public.trip_points (
    trip_id,
    driver_id,
    recorded_at,
    lng,
    lat,
    speed,
    heading,
    accuracy,
    provider,
    dedup_key
  )
  select
    v_trip_id,
    v_driver_id,
    case
      when p.idx = v_raw_count - 1 then v_ended_at
      else v_started_at + (p.idx * interval '54 seconds')
    end,
    p.lng,
    p.lat,
    p.speed,
    p.heading,
    p.accuracy,
    'dummy-osrm-match',
    v_local_trip_id || '-raw-' || p.idx
  from pg_temp.dummy_obrero_raw_points p
  order by p.idx;

  perform setval(
    pg_get_serial_sequence('public.trips', 'trip_id'),
    greatest(v_trip_id, coalesce((select max(t.trip_id) from public.trips t), v_trip_id)),
    true
  );
end $$;

select
  t.trip_id,
  'TRIP-' || t.trip_id as trip_label,
  d.driver_code,
  concat_ws(' ', d.first_name, d.last_name) as driver_name,
  tr.plate_no,
  t.start_display_name,
  t.end_display_name,
  t.fare_amount,
  t.duration_minutes,
  (t.trip_metrics -> 'routeMatchSummary' ->> 'provider') as route_provider,
  (t.trip_metrics -> 'routeMatchSummary' ->> 'confidence') as route_confidence,
  (select count(*) from public.trip_route_points rp where rp.trip_id = t.trip_id) as matched_route_points,
  (select count(*) from public.trip_points tp where tp.trip_id = t.trip_id) as raw_gps_points
from public.trips t
join public.drivers d on d.driver_id = t.driver_id
join public.tricycles tr on tr.tricycle_id = t.tricycle_id
where t.trip_id = (
  select max(r.trip_id)
  from public.trip_routes r
  where r.local_trip_id = 'DUMMY-OSRM-MATCH-OBRERO-LONG-01'
    and r.trip_id is not null
);
