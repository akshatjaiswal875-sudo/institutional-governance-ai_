-- Owner-based meeting permissions for all authenticated institutional users.
-- Meeting creators are the only users allowed to change meeting content and membership.
-- Invited participants can read meeting materials, including recordings and MoM.

create or replace function public.owns_meeting(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = target_meeting_id and m.created_by = auth.uid()
  );
$$;

create or replace function public.is_meeting_member(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.meetings m
    where m.id = target_meeting_id
      and (
        m.created_by = auth.uid()
        or exists (
          select 1 from public.participants p
          where p.meeting_id = m.id and p.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.owns_meeting(uuid) to authenticated;
grant execute on function public.is_meeting_member(uuid) to authenticated;

-- Meetings: any authenticated user can create a meeting for themselves.
drop policy if exists meetings_leadership_insert on public.meetings;
drop policy if exists meetings_leadership_update on public.meetings;
drop policy if exists meetings_director_delete on public.meetings;
drop policy if exists meetings_owner_insert on public.meetings;
drop policy if exists meetings_owner_update on public.meetings;
drop policy if exists meetings_owner_delete on public.meetings;

create policy meetings_owner_insert on public.meetings
for insert to authenticated
with check (created_by = auth.uid());

create policy meetings_owner_update on public.meetings
for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy meetings_owner_delete on public.meetings
for delete to authenticated
using (created_by = auth.uid());

drop policy if exists meetings_participant_read on public.meetings;
create policy meetings_participant_read on public.meetings
for select to authenticated
using (public.is_meeting_member(id));

-- Participants: owner controls membership; a user can read their own invitation.
drop policy if exists participants_staff_write on public.participants;
drop policy if exists participants_owner_write on public.participants;
drop policy if exists participants_owner_read on public.participants;

create policy participants_owner_read on public.participants
for select to authenticated
using (public.is_meeting_member(meeting_id));

create policy participants_owner_write on public.participants
for all to authenticated
using (public.owns_meeting(meeting_id))
with check (public.owns_meeting(meeting_id));

-- Agenda.
drop policy if exists agenda_items_staff_write on public.agenda_items;
drop policy if exists agenda_items_owner_read on public.agenda_items;
drop policy if exists agenda_items_owner_write on public.agenda_items;
create policy agenda_items_owner_read on public.agenda_items
for select to authenticated
using (public.is_meeting_member(meeting_id));
create policy agenda_items_owner_write on public.agenda_items
for all to authenticated
using (public.owns_meeting(meeting_id))
with check (public.owns_meeting(meeting_id));

-- Minutes / MoM.
drop policy if exists minutes_authenticated_read on public.minutes;
drop policy if exists minutes_authenticated_insert on public.minutes;
drop policy if exists minutes_authenticated_update on public.minutes;
drop policy if exists minutes_authenticated_delete on public.minutes;
drop policy if exists minutes_owner_read on public.minutes;
drop policy if exists minutes_owner_write on public.minutes;
create policy minutes_owner_read on public.minutes
for select to authenticated
using (public.is_meeting_member(meeting_id));
create policy minutes_owner_write on public.minutes
for all to authenticated
using (public.owns_meeting(meeting_id))
with check (public.owns_meeting(meeting_id));

-- Decisions.
drop policy if exists decisions_authenticated_read on public.decisions;
drop policy if exists decisions_staff_write_authenticated on public.decisions;
drop policy if exists decisions_owner_read on public.decisions;
drop policy if exists decisions_owner_write on public.decisions;
create policy decisions_owner_read on public.decisions
for select to authenticated
using (public.is_meeting_member(meeting_id));
create policy decisions_owner_write on public.decisions
for all to authenticated
using (public.owns_meeting(meeting_id))
with check (public.owns_meeting(meeting_id));

-- Recordings and AI-generated transcript/analysis.
drop policy if exists meeting_recordings_staff_read on public.meeting_recordings;
drop policy if exists meeting_recordings_staff_write on public.meeting_recordings;
drop policy if exists meeting_recordings_member_read on public.meeting_recordings;
drop policy if exists meeting_recordings_owner_write on public.meeting_recordings;
create policy meeting_recordings_member_read on public.meeting_recordings
for select to authenticated
using (public.is_meeting_member(meeting_id));
create policy meeting_recordings_owner_write on public.meeting_recordings
for all to authenticated
using (public.owns_meeting(meeting_id))
with check (public.owns_meeting(meeting_id));

drop policy if exists meeting_transcripts_read on public.meeting_transcripts;
drop policy if exists meeting_transcripts_staff_write on public.meeting_transcripts;
drop policy if exists meeting_transcripts_member_read on public.meeting_transcripts;
drop policy if exists meeting_transcripts_owner_write on public.meeting_transcripts;
create policy meeting_transcripts_member_read on public.meeting_transcripts
for select to authenticated
using (public.is_meeting_member(meeting_id));
create policy meeting_transcripts_owner_write on public.meeting_transcripts
for all to authenticated
using (public.owns_meeting(meeting_id))
with check (public.owns_meeting(meeting_id));

drop policy if exists meeting_ai_analysis_read on public.meeting_ai_analysis;
drop policy if exists meeting_ai_analysis_staff_write on public.meeting_ai_analysis;
drop policy if exists meeting_ai_analysis_member_read on public.meeting_ai_analysis;
drop policy if exists meeting_ai_analysis_owner_write on public.meeting_ai_analysis;
create policy meeting_ai_analysis_member_read on public.meeting_ai_analysis
for select to authenticated
using (public.is_meeting_member(meeting_id));
create policy meeting_ai_analysis_owner_write on public.meeting_ai_analysis
for all to authenticated
using (public.owns_meeting(meeting_id))
with check (public.owns_meeting(meeting_id));

-- Institutional timetable is a shared resource: any authenticated user may import.
drop policy if exists "Super admins manage institutional timetable" on public.institutional_timetable_entries;
drop policy if exists "Authenticated users manage institutional timetable" on public.institutional_timetable_entries;
create policy "Authenticated users manage institutional timetable" on public.institutional_timetable_entries
for all to authenticated
using (true)
with check (created_by = auth.uid());

-- Private meeting media: invited participants may read, only the meeting owner may write/delete.
drop policy if exists meeting_media_authenticated_read on storage.objects;
drop policy if exists meeting_media_authenticated_upload on storage.objects;
drop policy if exists meeting_media_authenticated_update on storage.objects;
drop policy if exists meeting_media_authenticated_delete on storage.objects;

create policy meeting_media_authenticated_read on storage.objects
for select to authenticated
using (
  bucket_id = 'meeting-media'
  and exists (
    select 1 from public.meetings m
    where m.id::text = (storage.foldername(name))[2]
      and public.is_meeting_member(m.id)
  )
);

create policy meeting_media_authenticated_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'meeting-media'
  and (storage.foldername(name))[1] = 'meetings'
  and exists (
    select 1 from public.meetings m
    where m.id::text = (storage.foldername(name))[2]
      and m.created_by = auth.uid()
  )
);

create policy meeting_media_authenticated_update on storage.objects
for update to authenticated
using (
  bucket_id = 'meeting-media'
  and exists (
    select 1 from public.meetings m
    where m.id::text = (storage.foldername(name))[2]
      and m.created_by = auth.uid()
  )
)
with check (
  bucket_id = 'meeting-media'
  and (storage.foldername(name))[1] = 'meetings'
  and exists (
    select 1 from public.meetings m
    where m.id::text = (storage.foldername(name))[2]
      and m.created_by = auth.uid()
  )
);

create policy meeting_media_authenticated_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'meeting-media'
  and exists (
    select 1 from public.meetings m
    where m.id::text = (storage.foldername(name))[2]
      and m.created_by = auth.uid()
  )
);

-- Action items are part of the meeting record and follow the same owner-only edit rule.
drop policy if exists action_items_authenticated_read on public.action_items;
drop policy if exists action_items_leader_insert on public.action_items;
drop policy if exists action_items_leader_update on public.action_items;
drop policy if exists action_items_owner_read on public.action_items;
drop policy if exists action_items_owner_write on public.action_items;
create policy action_items_owner_read on public.action_items
for select to authenticated
using (public.is_meeting_member(meeting_id));
create policy action_items_owner_write on public.action_items
for all to authenticated
using (public.owns_meeting(meeting_id))
with check (public.owns_meeting(meeting_id));
