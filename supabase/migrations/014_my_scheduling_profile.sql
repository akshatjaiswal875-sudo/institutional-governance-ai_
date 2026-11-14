-- Phase 1: self-service scheduling profiles, recurring availability and exceptions.
-- Existing user_availability rows are preserved; this migration only adds safe defaults/constraints.

create table if not exists public.user_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_availability_valid_window check (end_time > start_time)
);

alter table public.user_availability
  add column if not exists available boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists user_availability_unique_window
  on public.user_availability(user_id, day_of_week, start_time, end_time);
create index if not exists user_availability_user_day_idx
  on public.user_availability(user_id, day_of_week);

create table if not exists public.user_scheduling_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata',
  preferred_start_time time,
  preferred_end_time time,
  default_duration_minutes integer not null default 60 check (default_duration_minutes between 15 and 480),
  buffer_minutes integer not null default 15 check (buffer_minutes between 0 and 180),
  max_meetings_per_day integer not null default 5 check (max_meetings_per_day between 1 and 20),
  updated_at timestamptz not null default now(),
  constraint user_scheduling_preferred_window check (
    preferred_start_time is null or preferred_end_time is null or preferred_end_time > preferred_start_time
  )
);

create table if not exists public.user_unavailability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint user_unavailability_valid_window check (ends_at > starts_at)
);
create index if not exists user_unavailability_user_window_idx
  on public.user_unavailability(user_id, starts_at, ends_at);

alter table public.user_availability enable row level security;
alter table public.user_scheduling_preferences enable row level security;
alter table public.user_unavailability enable row level security;

drop policy if exists user_availability_self_manage on public.user_availability;
create policy user_availability_self_manage on public.user_availability
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_scheduling_preferences_self_manage on public.user_scheduling_preferences;
create policy user_scheduling_preferences_self_manage on public.user_scheduling_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_unavailability_self_manage on public.user_unavailability;
create policy user_unavailability_self_manage on public.user_unavailability
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_availability to authenticated;
grant select, insert, update, delete on public.user_scheduling_preferences to authenticated;
grant select, insert, update, delete on public.user_unavailability to authenticated;

-- One transaction replaces a user's recurring schedule, preferences and exceptions.
create or replace function public.save_my_scheduling_profile(
  p_availability jsonb,
  p_preferences jsonb,
  p_unavailability jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_saved_availability integer := 0;
  v_saved_unavailability integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_availability, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_unavailability, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_preferences, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid scheduling profile payload' using errcode = '22023';
  end if;

  insert into public.user_scheduling_preferences (
    user_id, timezone, preferred_start_time, preferred_end_time,
    default_duration_minutes, buffer_minutes, max_meetings_per_day, updated_at
  ) values (
    v_user_id,
    coalesce(nullif(p_preferences->>'timezone',''), 'Asia/Kolkata'),
    nullif(p_preferences->>'preferred_start_time','')::time,
    nullif(p_preferences->>'preferred_end_time','')::time,
    coalesce((p_preferences->>'default_duration_minutes')::integer, 60),
    coalesce((p_preferences->>'buffer_minutes')::integer, 15),
    coalesce((p_preferences->>'max_meetings_per_day')::integer, 5),
    now()
  )
  on conflict (user_id) do update set
    timezone = excluded.timezone,
    preferred_start_time = excluded.preferred_start_time,
    preferred_end_time = excluded.preferred_end_time,
    default_duration_minutes = excluded.default_duration_minutes,
    buffer_minutes = excluded.buffer_minutes,
    max_meetings_per_day = excluded.max_meetings_per_day,
    updated_at = now();

  delete from public.user_availability where user_id = v_user_id;
  insert into public.user_availability(user_id, day_of_week, start_time, end_time, available, updated_at)
  select v_user_id, x.day_of_week, x.start_time, x.end_time, coalesce(x.available, true), now()
  from jsonb_to_recordset(coalesce(p_availability, '[]'::jsonb))
    as x(day_of_week smallint, start_time time, end_time time, available boolean);
  get diagnostics v_saved_availability = row_count;

  delete from public.user_unavailability where user_id = v_user_id;
  insert into public.user_unavailability(user_id, starts_at, ends_at, reason)
  select v_user_id, x.starts_at, x.ends_at, nullif(trim(x.reason), '')
  from jsonb_to_recordset(coalesce(p_unavailability, '[]'::jsonb))
    as x(starts_at timestamptz, ends_at timestamptz, reason text);
  get diagnostics v_saved_unavailability = row_count;

  return jsonb_build_object(
    'availability_count', v_saved_availability,
    'unavailability_count', v_saved_unavailability
  );
end;
$$;

revoke all on function public.save_my_scheduling_profile(jsonb, jsonb, jsonb) from public;
grant execute on function public.save_my_scheduling_profile(jsonb, jsonb, jsonb) to authenticated;
