-- Governance role/workflow hardening.
-- The live project already contains these changes; this migration keeps the
-- schema reproducible for fresh environments and future Supabase restores.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Director';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Principal';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'HOD';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Coordinator';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Faculty / Volunteers';

CREATE OR REPLACE FUNCTION public.can_manage_meetings() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT public.has_governance_role(ARRAY['Director','Principal','HOD','Coordinator','Super Admin','Meeting Secretary']::public.user_role[]) $$;

CREATE OR REPLACE FUNCTION public.can_review_governance() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT public.has_governance_role(ARRAY['Director','Principal','HOD','Coordinator','Super Admin','Meeting Secretary']::public.user_role[]) $$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT public.current_role() IN ('Director','Principal','HOD','Coordinator','Faculty / Volunteers','Super Admin','Meeting Secretary','Faculty / Officer','Auditor') $$;

CREATE OR REPLACE FUNCTION public.can_assign_to(role_to public.user_role) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $$
DECLARE r public.user_role;
BEGIN
  r := public.current_role();
  IF r IN ('Director','Super Admin') THEN RETURN role_to IS NOT NULL;
  ELSIF r IN ('Principal','Meeting Secretary') THEN RETURN role_to IN ('HOD','Coordinator','Faculty / Officer','Faculty / Volunteers','Member');
  ELSIF r IN ('HOD','Coordinator') THEN RETURN role_to IN ('Faculty / Officer','Faculty / Volunteers','Member');
  ELSE RETURN false;
  END IF;
END;
$$;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check CHECK (status = ANY (ARRAY['Draft','Under Review','Approved','Published','Upcoming','Ongoing','Completed','Cancelled']::text[]));

DROP POLICY IF EXISTS participants_staff_write ON public.participants;
CREATE POLICY participants_staff_write ON public.participants FOR ALL TO authenticated USING (public.can_manage_meetings()) WITH CHECK (public.can_manage_meetings());

DROP POLICY IF EXISTS agenda_items_staff_write ON public.agenda_items;
CREATE POLICY agenda_items_staff_write ON public.agenda_items FOR ALL TO authenticated USING (public.can_manage_meetings()) WITH CHECK (public.can_manage_meetings());

DROP POLICY IF EXISTS minutes_authenticated_insert ON public.minutes;
CREATE POLICY minutes_authenticated_insert ON public.minutes FOR INSERT TO authenticated WITH CHECK ((public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer') AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_staff() OR m.created_by = auth.uid() OR m.assigned_approver_id = auth.uid())));
DROP POLICY IF EXISTS minutes_authenticated_update ON public.minutes;
CREATE POLICY minutes_authenticated_update ON public.minutes FOR UPDATE TO authenticated USING ((public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer') AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_staff() OR m.created_by = auth.uid() OR m.assigned_approver_id = auth.uid()))) WITH CHECK ((public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer') AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_staff() OR m.created_by = auth.uid() OR m.assigned_approver_id = auth.uid())));
DROP POLICY IF EXISTS minutes_authenticated_delete ON public.minutes;
CREATE POLICY minutes_authenticated_delete ON public.minutes FOR DELETE TO authenticated USING ((public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer') AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_staff() OR m.created_by = auth.uid() OR m.assigned_approver_id = auth.uid())));

DROP POLICY IF EXISTS decisions_staff_write_authenticated ON public.decisions;
CREATE POLICY decisions_staff_write_authenticated ON public.decisions FOR ALL TO authenticated USING ((public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer') AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_staff() OR m.created_by = auth.uid() OR m.assigned_approver_id = auth.uid()))) WITH CHECK ((public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer') AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_staff() OR m.created_by = auth.uid() OR m.assigned_approver_id = auth.uid())));

DROP POLICY IF EXISTS meeting_ai_analysis_staff_write ON public.meeting_ai_analysis;
CREATE POLICY meeting_ai_analysis_staff_write ON public.meeting_ai_analysis FOR ALL TO authenticated USING (public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer') WITH CHECK (public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer');

DROP POLICY IF EXISTS meeting_recordings_staff_write ON public.meeting_recordings;
CREATE POLICY meeting_recordings_staff_write ON public.meeting_recordings FOR ALL TO authenticated USING ((public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer') AND created_by = auth.uid()) WITH CHECK ((public.can_manage_meetings() OR public.current_role() = 'Faculty / Officer') AND created_by = auth.uid());

DROP POLICY IF EXISTS users_admin_update ON public.users;
CREATE POLICY users_admin_update ON public.users FOR UPDATE TO authenticated USING (public.current_role() IN ('Director','Super Admin')) WITH CHECK (public.current_role() IN ('Director','Super Admin'));

CREATE POLICY IF NOT EXISTS embeddings_governance_leader_write ON public.embeddings FOR ALL TO authenticated USING (public.can_manage_meetings()) WITH CHECK (public.can_manage_meetings());
