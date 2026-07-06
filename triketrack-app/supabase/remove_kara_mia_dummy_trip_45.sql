-- Remove the dummy Trip #45 that was previously seeded for Kara Mia (D-007).

do $$
declare
  v_driver_id bigint;
begin
  select d.driver_id
  into v_driver_id
  from public.drivers d
  where d.driver_code = 'D-007'
  limit 1;

  delete from public.trip_routes
  where trip_id = 45
     or local_trip_id = 'TRIP-45'
     or (v_driver_id is not null and driver_id = v_driver_id and local_trip_id = 'TRIP-45');

  delete from public.trip_route_points
  where trip_id = 45;

  delete from public.trip_points
  where trip_id = 45;

  delete from public.trips
  where trip_id = 45
    and (v_driver_id is null or driver_id = v_driver_id);
end $$;

select
  count(*) as remaining_trip_45_rows
from public.trips
where trip_id = 45;
