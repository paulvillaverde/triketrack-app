-- Seed one completed OSRM-style demo trip for Kara Mia (D-007).
-- The saved route below is a road-matched route between:
--   start       = 7.079241, 125.614112 (De Guzman Street, below W. Vinzon Street)
--   matched end = 7.086738, 125.615766 (A. Inigo Street, nearest drivable point)
--   raw end     = 7.0868472, 125.6156739 (Lykke Cafe)
-- This keeps the solid route on the road while the final endpoint lands at
-- Lykke Cafe itself.

alter table public.trips add column if not exists start_location_raw jsonb;
alter table public.trips add column if not exists start_location_matched jsonb;
alter table public.trips add column if not exists end_location_raw jsonb;
alter table public.trips add column if not exists end_location_matched jsonb;
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
declare
  v_local_trip_id text := 'OSRM-DEMO-KARA-MIA-01';
  v_existing_trip_id bigint;
  v_trip_id bigint;
  v_driver_id bigint;
  v_tricycle_id bigint;
  v_toda_id bigint;
  v_route_id bigint;
  v_started_at timestamptz := now() - interval '170 seconds';
  v_ended_at timestamptz := now();
begin
  select d.driver_id, d.tricycle_id, d.toda_id
  into v_driver_id, v_tricycle_id, v_toda_id
  from public.drivers d
  where d.driver_code = 'D-007'
  limit 1;

  if v_driver_id is null then
    raise exception 'Driver D-007 (Kara Mia) was not found.';
  end if;

  if v_tricycle_id is null then
    raise exception 'Driver D-007 does not have a tricycle assigned.';
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

  select greatest(coalesce(max(t.trip_id), 0) + 1, 9000)
  into v_trip_id
  from public.trips t;

  select r.route_id
  into v_route_id
  from public.routes r
  where r.toda_id = v_toda_id
    and r.status::text = 'active'
  order by
    case
      when r.origin ilike '%guzman%'
        or r.origin ilike '%lykke%'
        or r.destination ilike '%guzman%'
        or r.destination ilike '%lykke%' then 0
      else 1
    end,
    r.route_id asc
  limit 1;

  if v_route_id is null then
    insert into public.routes (toda_id, origin, destination, status)
    values (
      v_toda_id,
      'De Guzman Street',
      'Lykke Cafe',
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
    3,
    10.00,
    'completed'::public.trip_status,
    jsonb_build_object('latitude', 7.079241, 'longitude', 125.614112),
    jsonb_build_object('latitude', 7.079241, 'longitude', 125.614112),
    jsonb_build_object('latitude', 7.0868472, 'longitude', 125.6156739),
    jsonb_build_object('latitude', 7.086738, 'longitude', 125.615766),
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'type', 'LineString',
      'coordinates', jsonb_build_array(
        jsonb_build_array(125.614112, 7.079241),
        jsonb_build_array(125.614104, 7.079256),
        jsonb_build_array(125.614090, 7.079295),
        jsonb_build_array(125.614086, 7.079347),
        jsonb_build_array(125.614088, 7.079398),
        jsonb_build_array(125.614092, 7.079643),
        jsonb_build_array(125.614097, 7.079962),
        jsonb_build_array(125.614101, 7.080177),
        jsonb_build_array(125.614105, 7.080440),
        jsonb_build_array(125.614115, 7.080741),
        jsonb_build_array(125.614125, 7.081036),
        jsonb_build_array(125.614127, 7.081080),
        jsonb_build_array(125.614127, 7.081101),
        jsonb_build_array(125.614139, 7.081339),
        jsonb_build_array(125.614149, 7.081538),
        jsonb_build_array(125.614158, 7.081740),
        jsonb_build_array(125.614829, 7.082294),
        jsonb_build_array(125.614546, 7.082641),
        jsonb_build_array(125.614245, 7.083029),
        jsonb_build_array(125.613945, 7.083412),
        jsonb_build_array(125.613652, 7.083767),
        jsonb_build_array(125.613342, 7.084135),
        jsonb_build_array(125.613040, 7.084512),
        jsonb_build_array(125.614162, 7.085437),
        jsonb_build_array(125.614234, 7.085497),
        jsonb_build_array(125.614312, 7.085559),
        jsonb_build_array(125.615362, 7.086404),
        jsonb_build_array(125.615417, 7.086450),
        jsonb_build_array(125.615466, 7.086488),
        jsonb_build_array(125.615478, 7.086499),
        jsonb_build_array(125.615766, 7.086738)
      )
    ),
    jsonb_build_object(
      'routeMatchSummary', jsonb_build_object(
        'provider', 'osrm-match',
        'confidence', 0.99,
        'roadNames', jsonb_build_array('De Guzman Street', 'P. Sobrecarey Street', 'A. Inigo Street'),
        'distanceMeters', 1077.2,
        'durationSeconds', 169.2,
        'inputPointCount', 6,
        'matchedPointCount', 31
      )
    ),
    jsonb_build_object(
      'sampleCount', 6,
      'averageAccuracyMeters', 5.2,
      'worstAccuracyMeters', 7,
      'bestAccuracyMeters', 4
    ),
    6,
    31,
    0,
    'SYNCED'
  );

  insert into public.trip_route_points (trip_id, idx, latitude, longitude)
  values
    (v_trip_id, 0, 7.079241, 125.614112),
    (v_trip_id, 1, 7.079256, 125.614104),
    (v_trip_id, 2, 7.079295, 125.614090),
    (v_trip_id, 3, 7.079347, 125.614086),
    (v_trip_id, 4, 7.079398, 125.614088),
    (v_trip_id, 5, 7.079643, 125.614092),
    (v_trip_id, 6, 7.079962, 125.614097),
    (v_trip_id, 7, 7.080177, 125.614101),
    (v_trip_id, 8, 7.080440, 125.614105),
    (v_trip_id, 9, 7.080741, 125.614115),
    (v_trip_id, 10, 7.081036, 125.614125),
    (v_trip_id, 11, 7.081080, 125.614127),
    (v_trip_id, 12, 7.081101, 125.614127),
    (v_trip_id, 13, 7.081339, 125.614139),
    (v_trip_id, 14, 7.081538, 125.614149),
    (v_trip_id, 15, 7.081740, 125.614158),
    (v_trip_id, 16, 7.082294, 125.614829),
    (v_trip_id, 17, 7.082641, 125.614546),
    (v_trip_id, 18, 7.083029, 125.614245),
    (v_trip_id, 19, 7.083412, 125.613945),
    (v_trip_id, 20, 7.083767, 125.613652),
    (v_trip_id, 21, 7.084135, 125.613342),
    (v_trip_id, 22, 7.084512, 125.613040),
    (v_trip_id, 23, 7.085437, 125.614162),
    (v_trip_id, 24, 7.085497, 125.614234),
    (v_trip_id, 25, 7.085559, 125.614312),
    (v_trip_id, 26, 7.086404, 125.615362),
    (v_trip_id, 27, 7.086450, 125.615417),
    (v_trip_id, 28, 7.086488, 125.615466),
    (v_trip_id, 29, 7.086499, 125.615478),
    (v_trip_id, 30, 7.086738, 125.615766);

  insert into public.trip_routes (
    local_trip_id,
    trip_id,
    driver_id,
    latitude,
    longitude,
    recorded_at
  )
  values
    (v_local_trip_id, v_trip_id, v_driver_id, 7.079241, 125.614112, v_started_at + interval '0 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.079256, 125.614104, v_started_at + interval '6 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.079295, 125.614090, v_started_at + interval '12 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.079347, 125.614086, v_started_at + interval '18 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.079398, 125.614088, v_started_at + interval '24 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.079643, 125.614092, v_started_at + interval '30 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.079962, 125.614097, v_started_at + interval '36 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.080177, 125.614101, v_started_at + interval '42 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.080440, 125.614105, v_started_at + interval '48 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.080741, 125.614115, v_started_at + interval '54 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.081036, 125.614125, v_started_at + interval '60 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.081080, 125.614127, v_started_at + interval '66 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.081101, 125.614127, v_started_at + interval '70 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.081339, 125.614139, v_started_at + interval '78 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.081538, 125.614149, v_started_at + interval '84 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.081740, 125.614158, v_started_at + interval '90 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.082294, 125.614829, v_started_at + interval '98 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.082641, 125.614546, v_started_at + interval '106 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.083029, 125.614245, v_started_at + interval '114 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.083412, 125.613945, v_started_at + interval '122 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.083767, 125.613652, v_started_at + interval '130 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.084135, 125.613342, v_started_at + interval '138 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.084512, 125.613040, v_started_at + interval '146 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.085437, 125.614162, v_started_at + interval '152 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.085497, 125.614234, v_started_at + interval '156 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.085559, 125.614312, v_started_at + interval '160 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.086404, 125.615362, v_started_at + interval '164 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.086450, 125.615417, v_started_at + interval '166 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.086488, 125.615466, v_started_at + interval '167 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.086499, 125.615478, v_started_at + interval '168 seconds'),
    (v_local_trip_id, v_trip_id, v_driver_id, 7.086738, 125.615766, v_ended_at);

  insert into public.trip_points (
    trip_id,
    driver_id,
    recorded_at,
    lng,
    lat,
    speed,
    accuracy,
    dedup_key
  )
  values
    (v_trip_id, v_driver_id, v_started_at + interval '0 seconds', 125.614112, 7.079241, 8, 5, v_local_trip_id || '-raw-1'),
    (v_trip_id, v_driver_id, v_started_at + interval '35 seconds', 125.614097, 7.079962, 12, 4, v_local_trip_id || '-raw-2'),
    (v_trip_id, v_driver_id, v_started_at + interval '70 seconds', 125.614149, 7.081538, 16, 5, v_local_trip_id || '-raw-3'),
    (v_trip_id, v_driver_id, v_started_at + interval '105 seconds', 125.614546, 7.082641, 14, 6, v_local_trip_id || '-raw-4'),
    (v_trip_id, v_driver_id, v_started_at + interval '140 seconds', 125.613040, 7.084512, 13, 7, v_local_trip_id || '-raw-5'),
    (v_trip_id, v_driver_id, v_started_at + interval '160 seconds', 125.615362, 7.086404, 7, 5, v_local_trip_id || '-raw-6'),
    (v_trip_id, v_driver_id, v_ended_at, 125.6156739, 7.0868472, 0, 4, v_local_trip_id || '-raw-7');

  perform setval(
    pg_get_serial_sequence('public.trips', 'trip_id'),
    greatest(
      v_trip_id,
      coalesce((select max(t.trip_id) from public.trips t), v_trip_id)
    ),
    true
  );
end $$;

select
  t.trip_id,
  'TRIP-' || t.trip_id as trip_label,
  d.driver_code,
  concat_ws(' ', d.first_name, d.last_name) as driver_name,
  tr.plate_no,
  t.trip_start,
  t.trip_end,
  t.fare_amount,
  t.duration_minutes,
  (t.trip_metrics -> 'routeMatchSummary' ->> 'provider') as route_provider,
  (t.trip_metrics -> 'routeMatchSummary' ->> 'confidence') as route_confidence,
  (select count(*) from public.trip_route_points rp where rp.trip_id = t.trip_id) as route_points,
  (select count(*) from public.trip_points tp where tp.trip_id = t.trip_id) as raw_points
from public.trips t
join public.drivers d on d.driver_id = t.driver_id
join public.tricycles tr on tr.tricycle_id = t.tricycle_id
where t.trip_id = (
  select max(r.trip_id)
  from public.trip_routes r
  where r.local_trip_id = 'OSRM-DEMO-KARA-MIA-01'
    and r.trip_id is not null
);
