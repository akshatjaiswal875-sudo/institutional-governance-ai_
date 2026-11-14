create table if not exists public.institutional_timetable_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text not null default 'lecture',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  department text,
  faculty_email text,
  room text,
  source_filename text not null,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint institutional_timetable_entries_valid_time check (ends_at > starts_at)
);
create index if not exists institutional_timetable_entries_time_idx
  on public.institutional_timetable_entries (starts_at, ends_at);
create index if not exists institutional_timetable_entries_department_idx
  on public.institutional_timetable_entries (department);
alter table public.institutional_timetable_entries enable row level security;
drop policy if exists "Super admins manage institutional timetable" on public.institutional_timetable_entries;
create policy "Super admins manage institutional timetable"
  on public.institutional_timetable_entries for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'Super Admin'::user_role))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'Super Admin'::user_role));
grant select, insert, update, delete on public.institutional_timetable_entries to service_role;
