-- Reconcile the notification schema with the application API.
-- 010_notifications.sql originally used source_type/source_id, while the
-- notification API and meeting flows use target_table/target_id.

alter table public.notifications
  add column if not exists target_table text,
  add column if not exists target_id uuid;

update public.notifications
set
  target_table = coalesce(target_table, source_type),
  target_id = coalesce(target_id, source_id)
where target_table is null or target_id is null;

create index if not exists notifications_target_idx
  on public.notifications(target_table, target_id);

grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
