-- Destructive reset for testing/demo use.
-- Run this in the Supabase SQL Editor when you want every driver to start fresh.
-- This clears trip history, traced routes, passenger-trip reports, and violation records.

begin;

truncate table,
  public.violation_appeals,
  public.mobile_violations,
  public.report_media,
  public.reports,
  public.passenger_scans,
  public.violations,
  public.trip_route_points,
  public.trip_routes,
  public.trip_points,
  public.trips
restart identity cascade;

update public.driver_locations
set
  is_online = false,
  updated_at = now();

commit;

select 'trips' as table_name, count(*) as remaining_rows from public.trips
union all
select 'trip_points', count(*) from public.trip_points
union all
select 'trip_route_points', count(*) from public.trip_route_points
union all
select 'trip_routes', count(*) from public.trip_routes
union all
select 'mobile_violations', count(*) from public.mobile_violations
union all
select 'violation_appeals', count(*) from public.violation_appeals
union all
select 'violations', count(*) from public.violations
union all
select 'reports', count(*) from public.reports
union all
select 'passenger_scans', count(*) from public.passenger_scans;
