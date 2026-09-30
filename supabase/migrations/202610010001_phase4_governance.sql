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

create or replace function public.global_governance_search(
  query_text text,
  entity_types text[] default array['policy','event','meeting','suggestion'],
  per_type_limit integer default 5
)
returns table(kind text, id uuid, custom_id text, title text, status text)
language sql stable security invoker as $$
  with input as (
    select lower(trim(query_text)) as raw,
           lower(regexp_replace(trim(query_text), '^([a-z]+)-0*([0-9]+)$', '\\1-\\2')) as normalized
  ),
  policy_rows as (
    select 'policy'::text as kind, p.id, p.custom_id, p.title, p.status::text as status,
      row_number() over (
        order by case
          when lower(p.custom_id) = (select raw from input) then 0
          when lower(regexp_replace(p.custom_id, '^([a-z]+)-0*([0-9]+)$', '\\1-\\2')) = (select normalized from input) then 1
          when lower(p.custom_id) like '%' || (select raw from input) || '%' then 2
          else 3 end,
          p.created_at desc
      ) as rn
    from public.policies p, input
    where p.deleted_at is null
      and 'policy' = any(entity_types)
      and (
        lower(p.custom_id) like '%' || input.raw || '%'
        or lower(p.custom_id) like '%' || input.normalized || '%'
        or lower(p.title) like '%' || input.raw || '%'
      )
  ),
  event_rows as (
    select 'event'::text as kind, e.id, e.custom_id, e.title, null::text as status,
      row_number() over (
        order by case
          when lower(e.custom_id) = (select raw from input) then 0
          when lower(regexp_replace(e.custom_id, '^([a-z]+)-0*([0-9]+)$', '\\1-\\2')) = (select normalized from input) then 1
          when lower(e.custom_id) like '%' || (select raw from input) || '%' then 2
          else 3 end,
          e.created_at desc
      ) as rn
    from public.events e, input
    where e.deleted_at is null
      and 'event' = any(entity_types)
      and (
        lower(e.custom_id) like '%' || input.raw || '%'
        or lower(e.custom_id) like '%' || input.normalized || '%'
        or lower(e.title) like '%' || input.raw || '%'
      )
  ),
  meeting_rows as (
    select 'meeting'::text as kind, m.id, null::text as custom_id, m.title, null::text as status,
      row_number() over (order by m.created_at desc) as rn
    from public.meetings m, input
    where m.deleted_at is null
      and 'meeting' = any(entity_types)
      and lower(m.title) like '%' || input.raw || '%'
  ),
  suggestion_rows as (
    select 'suggestion'::text as kind, s.id, null::text as custom_id, s.title, s.status::text as status,
      row_number() over (order by s.created_at desc) as rn
    from public.suggestions s, input
    where s.deleted_at is null
      and 'suggestion' = any(entity_types)
      and (
        lower(s.title) like '%' || input.raw || '%'
        or exists (
          select 1
          from public.suggestion_policy_tags pt
          join public.policies p on p.id = pt.policy_id
          where pt.suggestion_id = s.id
            and p.deleted_at is null
            and (
              lower(p.custom_id) like '%' || input.raw || '%'
              or lower(regexp_replace(p.custom_id, '^([a-z]+)-0*([0-9]+)$', '\\1-\\2')) like '%' || input.normalized || '%'
            )
        )
        or exists (
          select 1
          from public.suggestion_event_tags et
          join public.events e on e.id = et.event_id
          where et.suggestion_id = s.id
            and e.deleted_at is null
            and (
              lower(e.custom_id) like '%' || input.raw || '%'
              or lower(regexp_replace(e.custom_id, '^([a-z]+)-0*([0-9]+)$', '\\1-\\2')) like '%' || input.normalized || '%'
            )
        )
      )
  )
  select kind, id, custom_id, title, status from policy_rows where rn <= greatest(1, least(per_type_limit, 5))
  union all
  select kind, id, custom_id, title, status from event_rows where rn <= greatest(1, least(per_type_limit, 5))
  union all
  select kind, id, custom_id, title, status from meeting_rows where rn <= greatest(1, least(per_type_limit, 5))
  union all
  select kind, id, custom_id, title, status from suggestion_rows where rn <= greatest(1, least(per_type_limit, 5));
$$;
