-- Run this in the Supabase SQL Editor for `irkbdinugnasepjowhzr.supabase.co`
-- Use this as a quick repair if login says `avatar_url` is missing on `public.drivers`.

alter table public.drivers add column if not exists contact_no text;
alter table public.drivers add column if not exists avatar_url text;
alter table public.drivers add column if not exists password_hash text;
alter table public.drivers add column if not exists updated_at timestamptz not null default now();
alter table public.drivers add column if not exists tricycle_id bigint;
alter table public.drivers add column if not exists qr_id bigint;

update public.drivers
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

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
  where d.status = 'active'
    and upper(coalesce(d.driver_code, d.driver_id::text)) = upper(p_driver_code)
    and d.password_hash is not null
    and d.password_hash = extensions.crypt(p_password, d.password_hash)
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
      and d.status = 'active'
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
    and status = 'active'
  returning avatar_url into v_avatar_url;

  return v_avatar_url;
end;
$$;

grant execute on function public.set_driver_avatar(bigint, text) to anon, authenticated;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then null;
end $$;
