create table if not exists public.task_reports(
  id uuid primary key default gen_random_uuid(),
  action_item_id uuid not null references public.action_items(id) on delete cascade,
  submitted_by uuid not null references public.users(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists task_reports_action_item_idx on public.task_reports(action_item_id, created_at desc);
create index if not exists action_items_assignee_idx on public.action_items(assignee_id, status, due_date);
create index if not exists action_items_creator_idx on public.action_items(created_by, status, due_date);

alter table public.task_reports enable row level security;

drop policy if exists task_reports_read on public.task_reports;
drop policy if exists task_reports_insert on public.task_reports;

create policy task_reports_read on public.task_reports
for select using (
  submitted_by = auth.uid()
  or exists (
    select 1 from public.action_items a
    where a.id = task_reports.action_item_id
      and a.created_by = auth.uid()
  )
);

create policy task_reports_insert on public.task_reports
for insert with check (
  submitted_by = auth.uid()
  and exists (
    select 1 from public.action_items a
    where a.id = task_reports.action_item_id
      and a.assignee_id = auth.uid()
  )
);

grant select, insert on table public.task_reports to authenticated;

insert into storage.buckets(id, name, public)
values ('task-reports', 'task-reports', false)
on conflict (id) do nothing;

-- The application server uses the service-role client for private report uploads/downloads.
-- These policies also protect direct authenticated Storage access if it is ever enabled.
drop policy if exists task_reports_storage_read on storage.objects;
drop policy if exists task_reports_storage_insert on storage.objects;

create policy task_reports_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'task-reports'
  and (storage.foldername(name))[1] in (
    select id::text from public.action_items where assignee_id = auth.uid() or created_by = auth.uid()
  )
);

create policy task_reports_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'task-reports'
  and (storage.foldername(name))[1] in (
    select id::text from public.action_items where assignee_id = auth.uid()
  )
);