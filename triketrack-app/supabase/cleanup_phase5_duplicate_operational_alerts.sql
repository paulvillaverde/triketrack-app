-- Optional cleanup for duplicate Phase 5 timeout/silence alerts created before de-duping was tightened.
with ranked_alerts as (
  select
    id,
    row_number() over (
      partition by driver_id, trip_id, type
      order by occurred_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.mobile_violations
  where type in ('TRIP_TIMEOUT', 'GPS_SILENCE')
    and status in ('OPEN', 'UNDER_REVIEW')
)
update public.mobile_violations mv
set
  status = 'RESOLVED',
  details = trim(concat(coalesce(mv.details, ''), ' Duplicate operational alert closed during Phase 5 cleanup.')),
  updated_at = now()
from ranked_alerts ranked
where ranked.id = mv.id
  and ranked.duplicate_rank > 1;
