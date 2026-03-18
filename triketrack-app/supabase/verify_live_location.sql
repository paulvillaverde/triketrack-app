-- Live location verification script
-- Run this in Supabase SQL Editor after applying `supabase/schema.sql`.

-- 1. Driver exists and is active
select
  d.driver_id,
  d.driver_code,
  d.first_name,
  d.last_name,
  d.toda_id,
  d.status
from public.drivers d
where d.driver_code = 'D-001';

-- 2. Current live location row
select
  dl.driver_id,
  dl.driver_code,
  dl.latitude,
  dl.longitude,
  dl.is_online,
  dl.recorded_at,
  dl.updated_at
from public.driver_locations dl
where dl.driver_code = 'D-001';

-- 3. Realtime publication check
select
  pubname,
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'driver_locations';

-- 4. Force a live test update for D-001
select public.upsert_driver_location(
  1,
  'D-001',
  7.0848,
  125.6128,
  null,
  null,
  null,
  now()
);

-- 5. Recheck the live row after the forced update
select
  dl.driver_id,
  dl.driver_code,
  dl.latitude,
  dl.longitude,
  dl.is_online,
  dl.recorded_at,
  dl.updated_at
from public.driver_locations dl
where dl.driver_code = 'D-001';

-- 6. Mark the driver offline manually
select public.set_driver_location_offline(1);
