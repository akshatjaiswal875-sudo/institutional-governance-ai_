-- Owner-based meeting access model.
-- Authenticated users may create their own meetings; creator and Super Admin manage them.
-- Invited participants are read-only. Approval is performed through the authenticated workflow API.
-- No meeting records or storage objects are deleted by this migration.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_super_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.role::text = 'Super Admin'
    );
$$;

create or replace function private.owns_meeting(target_meeting_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    private.is_super_admin()
    or exists (
      select 1 from public.meetings m
      where m.id = target_meeting_id and m.created_by = (select auth.uid())
    )
  );
$$;

create or replace function private.is_meeting_member(target_meeting_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    private.owns_meeting(target_meeting_id)
    or exists (
      select 1 from public.participants p
      where p.meeting_id = target_meeting_id and p.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.meetings m
      where m.id = target_meeting_id and m.assigned_approver_id = (select auth.uid())
    )
  );
$$;

revoke all on function private.is_super_admin() from public, anon;
revoke all on function private.owns_meeting(uuid) from public, anon;
revoke all on function private.is_meeting_member(uuid) from public, anon;
grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.owns_meeting(uuid) to authenticated;
grant execute on function private.is_meeting_member(uuid) to authenticated;

-- Meetings: remove legacy role-based access. Approval changes use the server-only workflow path.
drop policy if exists meetings_authenticated_read on public.meetings;
drop policy if exists meetings_leadership_insert on public.meetings;
drop policy if exists meetings_leadership_update on public.meetings;
drop policy if exists meetings_director_delete on public.meetings;
drop policy if exists meetings_participant_read on public.meetings;
drop policy if exists meetings_owner_insert on public.meetings;
drop policy if exists meetings_owner_update on public.meetings;
drop policy if exists meetings_owner_delete on public.meetings;
create policy meetings_member_read on public.meetings
  for select to authenticated using (private.is_meeting_member(id) or assigned_approver_id = (select auth.uid()));
create policy meetings_owner_insert on public.meetings
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy meetings_owner_update on public.meetings
  for update to authenticated
  using (private.owns_meeting(id))
  with check (private.owns_meeting(id) and (created_by = (select auth.uid()) or private.is_super_admin()));
create policy meetings_owner_delete on public.meetings
  for delete to authenticated using (private.owns_meeting(id));

-- Participant roster: owner/Super Admin can manage; invitees can see their own invitation.
drop policy if exists participants_read on public.participants;
drop policy if exists participants_staff_write on public.participants;
drop policy if exists participants_owner_read on public.participants;
drop policy if exists participants_owner_write on public.participants;
create policy participants_member_read on public.participants
  for select to authenticated
  using (user_id = (select auth.uid()) or private.owns_meeting(meeting_id));
create policy participants_owner_write on public.participants
  for all to authenticated
  using (private.owns_meeting(meeting_id))
  with check (private.owns_meeting(meeting_id));

-- All meeting content follows the same member-read / owner-write boundary.
drop policy if exists agenda_items_read on public.agenda_items;
drop policy if exists agenda_items_staff_write on public.agenda_items;
drop policy if exists agenda_items_owner_read on public.agenda_items;
drop policy if exists agenda_items_owner_write on public.agenda_items;
create policy agenda_items_member_read on public.agenda_items
  for select to authenticated using (private.is_meeting_member(meeting_id));
create policy agenda_items_owner_write on public.agenda_items
  for all to authenticated using (private.owns_meeting(meeting_id))
  with check (private.owns_meeting(meeting_id));

drop policy if exists minutes_authenticated_read on public.minutes;
drop policy if exists minutes_authenticated_insert on public.minutes;
drop policy if exists minutes_authenticated_update on public.minutes;
drop policy if exists minutes_authenticated_delete on public.minutes;
drop policy if exists minutes_owner_read on public.minutes;
drop policy if exists minutes_owner_write on public.minutes;
create policy minutes_member_read on public.minutes
  for select to authenticated using (private.is_meeting_member(meeting_id));
create policy minutes_owner_write on public.minutes
  for all to authenticated using (private.owns_meeting(meeting_id))
  with check (private.owns_meeting(meeting_id));

drop policy if exists decisions_authenticated_read on public.decisions;
drop policy if exists decisions_staff_write_authenticated on public.decisions;
drop policy if exists decisions_owner_read on public.decisions;
drop policy if exists decisions_owner_write on public.decisions;
create policy decisions_member_read on public.decisions
  for select to authenticated using (private.is_meeting_member(meeting_id));
create policy decisions_owner_write on public.decisions
  for all to authenticated using (private.owns_meeting(meeting_id))
  with check (private.owns_meeting(meeting_id));

drop policy if exists action_items_authenticated_read on public.action_items;
drop policy if exists action_items_leader_insert on public.action_items;
drop policy if exists action_items_leader_update on public.action_items;
drop policy if exists action_items_owner_read on public.action_items;
drop policy if exists action_items_owner_write on public.action_items;
create policy action_items_member_read on public.action_items
  for select to authenticated using (private.is_meeting_member(meeting_id));
create policy action_items_owner_write on public.action_items
  for all to authenticated using (private.owns_meeting(meeting_id))
  with check (private.owns_meeting(meeting_id));

drop policy if exists meeting_recordings_staff_read on public.meeting_recordings;
drop policy if exists meeting_recordings_staff_write on public.meeting_recordings;
drop policy if exists meeting_recordings_member_read on public.meeting_recordings;
drop policy if exists meeting_recordings_owner_write on public.meeting_recordings;
create policy meeting_recordings_member_read on public.meeting_recordings
  for select to authenticated using (private.is_meeting_member(meeting_id));
create policy meeting_recordings_owner_write on public.meeting_recordings
  for all to authenticated using (private.owns_meeting(meeting_id))
  with check (private.owns_meeting(meeting_id));

drop policy if exists meeting_transcripts_read on public.meeting_transcripts;
drop policy if exists meeting_transcripts_staff_write on public.meeting_transcripts;
drop policy if exists meeting_transcripts_member_read on public.meeting_transcripts;
drop policy if exists meeting_transcripts_owner_write on public.meeting_transcripts;
create policy meeting_transcripts_member_read on public.meeting_transcripts
  for select to authenticated using (private.is_meeting_member(meeting_id));
create policy meeting_transcripts_owner_write on public.meeting_transcripts
  for all to authenticated using (private.owns_meeting(meeting_id))
  with check (private.owns_meeting(meeting_id));

drop policy if exists meeting_ai_analysis_read on public.meeting_ai_analysis;
drop policy if exists meeting_ai_analysis_staff_write on public.meeting_ai_analysis;
drop policy if exists meeting_ai_analysis_member_read on public.meeting_ai_analysis;
drop policy if exists meeting_ai_analysis_owner_write on public.meeting_ai_analysis;
create policy meeting_ai_analysis_member_read on public.meeting_ai_analysis
  for select to authenticated using (private.is_meeting_member(meeting_id));
create policy meeting_ai_analysis_owner_write on public.meeting_ai_analysis
  for all to authenticated using (private.owns_meeting(meeting_id))
  with check (private.owns_meeting(meeting_id));

-- Shared timetable: authenticated users can read and import their own rows.
drop policy if exists "Super admins manage institutional timetable" on public.institutional_timetable_entries;
drop policy if exists "Authenticated users manage institutional timetable" on public.institutional_timetable_entries;
drop policy if exists timetable_authenticated_read on public.institutional_timetable_entries;
drop policy if exists timetable_authenticated_insert on public.institutional_timetable_entries;
drop policy if exists timetable_owner_update on public.institutional_timetable_entries;
drop policy if exists timetable_owner_delete on public.institutional_timetable_entries;
create policy timetable_authenticated_read on public.institutional_timetable_entries
  for select to authenticated using (true);
create policy timetable_authenticated_insert on public.institutional_timetable_entries
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy timetable_owner_update on public.institutional_timetable_entries
  for update to authenticated
  using (created_by = (select auth.uid()) or private.is_super_admin())
  with check (created_by = (select auth.uid()) or private.is_super_admin());
create policy timetable_owner_delete on public.institutional_timetable_entries
  for delete to authenticated using (created_by = (select auth.uid()) or private.is_super_admin());

-- Embeddings: remove exact live policy names; preserve approved policy and published event search.
drop policy if exists embeddings_authenticated_read on public.embeddings;
drop policy if exists embeddings_governance_leader_write on public.embeddings;
drop policy if exists embeddings_staff_write_authenticated on public.embeddings;
drop policy if exists meeting_embeddings_member_read on public.embeddings;
drop policy if exists meeting_embeddings_owner_write on public.embeddings;
create policy embeddings_member_read on public.embeddings
  for select to authenticated using (
    (parent_type = 'meeting' and private.is_meeting_member(parent_id))
    or (parent_type = 'policy' and exists (
      select 1 from public.policies p
      where p.id = embeddings.parent_id and p.status::text = 'Approved'
    ))
    or (parent_type = 'event' and exists (
      select 1 from public.events e
      where e.id = embeddings.parent_id and e.status::text = 'Published'
    ))
  );
create policy meeting_embeddings_owner_write on public.embeddings
  for all to authenticated
  using (parent_type = 'meeting' and private.owns_meeting(parent_id))
  with check (parent_type = 'meeting' and private.owns_meeting(parent_id));

-- Private media remains private. Invited participants can read; only creator/Super Admin writes.
drop policy if exists meeting_media_authenticated_read on storage.objects;
drop policy if exists meeting_media_authenticated_upload on storage.objects;
drop policy if exists meeting_media_authenticated_update on storage.objects;
drop policy if exists meeting_media_authenticated_delete on storage.objects;
create policy meeting_media_authenticated_read on storage.objects
  for select to authenticated using (
    bucket_id = 'meeting-media'
    and (storage.foldername(name))[1] = 'meetings'
    and exists (
      select 1 from public.meetings m
      where m.id::text = (storage.foldername(name))[2]
        and private.is_meeting_member(m.id)
    )
  );
create policy meeting_media_authenticated_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'meeting-media'
    and (storage.foldername(name))[1] = 'meetings'
    and exists (
      select 1 from public.meetings m
      where m.id::text = (storage.foldername(name))[2]
        and private.owns_meeting(m.id)
    )
  );
create policy meeting_media_authenticated_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'meeting-media'
    and (storage.foldername(name))[1] = 'meetings'
    and exists (
      select 1 from public.meetings m
      where m.id::text = (storage.foldername(name))[2]
        and private.owns_meeting(m.id)
    )
  )
  with check (
    bucket_id = 'meeting-media'
    and (storage.foldername(name))[1] = 'meetings'
    and exists (
      select 1 from public.meetings m
      where m.id::text = (storage.foldername(name))[2]
        and private.owns_meeting(m.id)
    )
  );
create policy meeting_media_authenticated_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'meeting-media'
    and (storage.foldername(name))[1] = 'meetings'
    and exists (
      select 1 from public.meetings m
      where m.id::text = (storage.foldername(name))[2]
        and private.owns_meeting(m.id)
    )
  );
