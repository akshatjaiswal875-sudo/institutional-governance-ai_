-- Keep one owner-scoped SELECT and UPDATE policy for notifications.
-- The removed policies had the same authenticated-user ownership checks.
drop policy if exists notifications_authenticated_read on public.notifications;
drop policy if exists notifications_authenticated_update on public.notifications;
