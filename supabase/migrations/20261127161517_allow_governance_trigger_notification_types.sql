alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'meeting',
    'approval',
    'task',
    'policy',
    'system',
    'event',
    'info',
    'action',
    'action_item_assigned',
    'meeting_approval',
    'policy_created',
    'policy_status_changed'
  ]::text[]));
