-- Secure the many-to-many suggestion tagging tables used by the suggestion API.
-- Tags can only be added/removed by the owner of the suggestion, while
-- authenticated users can read tags needed for linked suggestions/search.

alter table if exists public.suggestion_policy_tags enable row level security;
alter table if exists public.suggestion_event_tags enable row level security;

drop policy if exists "Authenticated users can read policy tags" on public.suggestion_policy_tags;
create policy "Authenticated users can read policy tags"
on public.suggestion_policy_tags
for select
to authenticated
using (true);

drop policy if exists "Suggestion owners can insert policy tags" on public.suggestion_policy_tags;
create policy "Suggestion owners can insert policy tags"
on public.suggestion_policy_tags
for insert
to authenticated
with check (
  exists (
    select 1
    from public.suggestions s
    where s.id = suggestion_id
      and s.submitted_by = auth.uid()
      and s.deleted_at is null
  )
  and exists (
    select 1
    from public.policies p
    where p.id = policy_id
      and p.deleted_at is null
      and p.status <> 'ARCHIVED'
  )
);

drop policy if exists "Suggestion owners can delete policy tags" on public.suggestion_policy_tags;
create policy "Suggestion owners can delete policy tags"
on public.suggestion_policy_tags
for delete
to authenticated
using (
  exists (
    select 1
    from public.suggestions s
    where s.id = suggestion_id
      and s.submitted_by = auth.uid()
  )
);

drop policy if exists "Authenticated users can read event tags" on public.suggestion_event_tags;
create policy "Authenticated users can read event tags"
on public.suggestion_event_tags
for select
to authenticated
using (true);

drop policy if exists "Suggestion owners can insert event tags" on public.suggestion_event_tags;
create policy "Suggestion owners can insert event tags"
on public.suggestion_event_tags
for insert
to authenticated
with check (
  exists (
    select 1
    from public.suggestions s
    where s.id = suggestion_id
      and s.submitted_by = auth.uid()
      and s.deleted_at is null
  )
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.deleted_at is null
  )
);

drop policy if exists "Suggestion owners can delete event tags" on public.suggestion_event_tags;
create policy "Suggestion owners can delete event tags"
on public.suggestion_event_tags
for delete
to authenticated
using (
  exists (
    select 1
    from public.suggestions s
    where s.id = suggestion_id
      and s.submitted_by = auth.uid()
  )
);
