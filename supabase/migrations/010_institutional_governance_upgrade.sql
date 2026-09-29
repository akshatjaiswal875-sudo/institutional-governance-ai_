-- Institutional governance upgrade: policy history, decision links, notifications,
-- indexes, safer search, and function grants.

create table if not exists public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  version integer not null,
  title text not null,
  content text not null,
  status public.policy_status not null,
  effective_date date,
  change_reason text,
  created_by uuid references public.users(id),
  approved_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique(policy_id, version)
);

create table if not exists public.policy_decision_links (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique(policy_id, decision_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('meeting','approval','task','policy','system')),
  title text not null,
  message text not null,
  target_table text,
  target_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists policy_versions_policy_idx on public.policy_versions(policy_id, version desc);
create index if not exists policy_decision_links_policy_idx on public.policy_decision_links(policy_id);
create index if not exists policy_decision_links_decision_idx on public.policy_decision_links(decision_id);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, read_at, created_at desc);
create index if not exists notifications_target_idx on public.notifications(target_table, target_id);
create index if not exists action_items_assignee_idx on public.action_items(assignee_id);
create index if not exists action_items_created_by_idx on public.action_items(created_by);
create index if not exists action_items_decision_idx on public.action_items(decision_id);
create index if not exists decisions_meeting_idx on public.decisions(meeting_id);
create index if not exists decisions_minute_idx on public.decisions(minute_id);
create index if not exists decisions_assignee_idx on public.decisions(assignee_id);
create index if not exists events_organizer_idx on public.events(organizer_id);
create index if not exists meeting_recordings_created_by_idx on public.meeting_recordings(created_by);
create index if not exists meeting_transcripts_recording_idx on public.meeting_transcripts(recording_id);
create index if not exists meeting_ai_analysis_transcript_idx on public.meeting_ai_analysis(transcript_id);
create index if not exists meetings_approver_idx on public.meetings(assigned_approver_id);
create index if not exists meetings_creator_idx on public.meetings(created_by);
create index if not exists minutes_meeting_idx on public.minutes(meeting_id);
create index if not exists participants_user_idx on public.participants(user_id);
create index if not exists policies_updated_by_idx on public.policies(updated_by);
create index if not exists audit_logs_user_idx on public.audit_logs(user_id);

alter table public.policy_versions enable row level security;
alter table public.policy_decision_links enable row level security;
alter table public.notifications enable row level security;

create policy policy_versions_read on public.policy_versions for select to authenticated using (
  public.is_staff() or exists (select 1 from public.policies p where p.id=policy_id and p.status='Approved')
);
create policy policy_versions_staff_write on public.policy_versions for all to authenticated using (
  public.current_role() in ('Super Admin','Meeting Secretary','Faculty / Officer')
) with check (
  public.current_role() in ('Super Admin','Meeting Secretary','Faculty / Officer')
);

create policy policy_decision_links_read on public.policy_decision_links for select to authenticated using (public.is_staff());
create policy policy_decision_links_staff_write on public.policy_decision_links for all to authenticated using (
  public.current_role() in ('Super Admin','Meeting Secretary','Faculty / Officer')
) with check (
  public.current_role() in ('Super Admin','Meeting Secretary','Faculty / Officer')
);

create policy notifications_self_read on public.notifications for select to authenticated using (user_id=(select auth.uid()));
create policy notifications_self_update on public.notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy notifications_staff_insert on public.notifications for insert to authenticated with check (
  public.current_role() in ('Super Admin','Meeting Secretary','Faculty / Officer')
);

revoke execute on function public.current_role() from anon;
revoke execute on function public.handle_new_auth_user() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
alter function public.hybrid_search(text, vector, integer) set search_path = public, extensions;

create or replace function public.create_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  target_table_name text default null,
  target_record_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare notification_id uuid;
begin
  if target_user_id is null then raise exception 'target_user_id is required'; end if;
  insert into public.notifications(user_id,type,title,message,target_table,target_id)
  values(target_user_id,notification_type,notification_title,notification_message,target_table_name,target_record_id)
  returning id into notification_id;
  return notification_id;
end;
$$;
grant execute on function public.create_notification(uuid,text,text,text,text,uuid) to authenticated;

create or replace function public.search_institutional_knowledge(query_text text, match_count integer default 20)
returns table(parent_type text,parent_id uuid,chunk_content text,metadata jsonb,rank double precision)
language sql stable
set search_path = public, extensions
as $$
select e.parent_type,e.parent_id,e.chunk_content,e.metadata,
       ts_rank_cd(to_tsvector('english',e.chunk_content), websearch_to_tsquery('english',query_text))::double precision as rank
from public.embeddings e
where to_tsvector('english',e.chunk_content) @@ websearch_to_tsquery('english',query_text)
  and (public.is_staff() or exists(select 1 from public.meetings m where e.parent_type='meeting' and m.id=e.parent_id and m.status='Published') or exists(select 1 from public.policies p where e.parent_type='policy' and p.id=e.parent_id and p.status='Approved'))
order by rank desc
limit greatest(1,least(match_count,100));
$$;
grant execute on function public.search_institutional_knowledge(text,integer) to authenticated;
