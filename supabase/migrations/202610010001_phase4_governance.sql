create table if not exists public.suggestion_policy_tags (
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, policy_id)
);

create table if not exists public.suggestion_event_tags (
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, event_id)
);

create index if not exists idx_suggestion_policy_tags_policy on public.suggestion_policy_tags(policy_id);
create index if not exists idx_suggestion_event_tags_event on public.suggestion_event_tags(event_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_id, created_at desc);

create or replace function public.global_governance_search(query_text text, entity_types text[] default array['policy','event','meeting','suggestion'], per_type_limit integer default 5)
returns table(kind text, id uuid, custom_id text, title text, status text) language sql stable security invoker as $$
  with q as (select lower(trim(query_text)) as term)
  select kind, id, custom_id, title, status from (
    select 'policy'::text kind, p.id, p.custom_id, p.title, p.status::text status,
      row_number() over (partition by 'policy' order by case when lower(p.custom_id) = (select term from q) then 0 else 1 end, p.created_at desc) rn
    from public.policies p, q where p.deleted_at is null and 'policy'=any(entity_types) and (lower(p.custom_id) like '%'||(select term from q)||'%' or lower(p.title) like '%'||(select term from q)||'%')
    union all
    select 'event', e.id, e.custom_id, e.title, null,
      row_number() over (partition by 'event' order by case when lower(e.custom_id) = (select term from q) then 0 else 1 end, e.created_at desc)
    from public.events e, q where e.deleted_at is null and 'event'=any(entity_types) and (lower(e.custom_id) like '%'||(select term from q)||'%' or lower(e.title) like '%'||(select term from q)||'%')
    union all
    select 'meeting', m.id, null, m.title, null,
      row_number() over (partition by 'meeting' order by m.created_at desc)
    from public.meetings m, q where m.deleted_at is null and 'meeting'=any(entity_types) and lower(m.title) like '%'||(select term from q)||'%'
    union all
    select 'suggestion', s.id, null, s.title, s.status,
      row_number() over (partition by 'suggestion' order by s.created_at desc)
    from public.suggestions s, q where s.deleted_at is null and 'suggestion'=any(entity_types) and lower(s.title) like '%'||(select term from q)||'%'
  ) x where rn <= greatest(1, least(per_type_limit, 5));
$$;
