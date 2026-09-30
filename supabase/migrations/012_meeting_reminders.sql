-- Idempotency ledger for automated meeting reminder emails.
-- One row per meeting/participant/reminder window prevents duplicate sends.
create table if not exists public.meeting_reminder_log (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('24h','1h','15m')),
  sent_at timestamptz not null default now(),
  unique (meeting_id, user_id, reminder_type)
);

create index if not exists meeting_reminder_log_meeting_idx
  on public.meeting_reminder_log(meeting_id, reminder_type);

alter table public.meeting_reminder_log enable row level security;

drop policy if exists meeting_reminder_log_admin_read on public.meeting_reminder_log;
create policy meeting_reminder_log_admin_read
  on public.meeting_reminder_log
  for select to authenticated
  using (public.can_manage_meetings());

grant select on public.meeting_reminder_log to authenticated;
grant all on public.meeting_reminder_log to service_role;
