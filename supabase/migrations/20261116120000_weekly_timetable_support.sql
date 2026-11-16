-- Add recurring weekly timetable support while preserving existing dated rows.
-- Existing rows remain non-recurring and are not modified.
alter table public.institutional_timetable_entries
  alter column starts_at drop not null,
  alter column ends_at drop not null;

alter table public.institutional_timetable_entries
  add column if not exists is_recurring_weekly boolean not null default false,
  add column if not exists weekday smallint,
  add column if not exists start_time time,
  add column if not exists end_time time;

alter table public.institutional_timetable_entries
  drop constraint if exists institutional_timetable_entries_schedule_shape;

alter table public.institutional_timetable_entries
  add constraint institutional_timetable_entries_schedule_shape check (
    (
      is_recurring_weekly = true
      and weekday between 1 and 7
      and start_time is not null
      and end_time is not null
      and end_time > start_time
      and starts_at is null
      and ends_at is null
    )
    or
    (
      is_recurring_weekly = false
      and weekday is null
      and start_time is null
      and end_time is null
      and starts_at is not null
      and ends_at is not null
      and ends_at > starts_at
    )
  );

create index if not exists institutional_timetable_weekly_idx
  on public.institutional_timetable_entries (weekday, start_time, end_time)
  where is_recurring_weekly = true;

create index if not exists institutional_timetable_owner_idx
  on public.institutional_timetable_entries (created_by, faculty_email);
