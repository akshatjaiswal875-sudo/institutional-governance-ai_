-- Server-only admin client uses service_role. Keep these grants limited to the
-- service role; browser access remains protected by RLS and normal grants.
grant select, insert, update, delete on public.events to service_role;
grant select, insert, update, delete on public.meeting_recordings to service_role;
grant select, insert, update, delete on public.meeting_transcripts to service_role;
grant select, insert, update, delete on public.meeting_ai_analysis to service_role;
grant select, insert, update, delete on public.participants to service_role;
grant select, insert, update, delete on public.agenda_items to service_role;
grant select, insert, update, delete on public.action_items to service_role;
