-- Tighten recurring timetable validation: weekday must be explicitly provided.
alter table public.institutional_timetable_entries
  drop constraint if exists institutional_timetable_entries_schedule_shape;
alter table public.institutional_timetable_entries
  add constraint institutional_timetable_entries_schedule_shape check (
    (
      is_recurring_weekly = true
      and weekday is not null
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
