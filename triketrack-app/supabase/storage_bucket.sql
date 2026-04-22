-- Run this in the Supabase SQL Editor for:
-- `irkbdinugnasepjowhzr.supabase.co`
-- This creates the `driver-avatars` and `violation-proofs` storage buckets and policies.

insert into storage.buckets (id, name, public)
values ('driver-avatars', 'driver-avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('violation-proofs', 'violation-proofs', true)
on conflict (id) do nothing;

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
