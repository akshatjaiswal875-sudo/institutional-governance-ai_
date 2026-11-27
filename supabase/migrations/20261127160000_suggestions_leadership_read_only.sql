-- Leadership roles are observers in the Suggestion Box.
-- Coordinators and Meeting Secretaries retain the existing review workflow.
CREATE OR REPLACE FUNCTION public.can_review_governance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_governance_role(
    ARRAY['Coordinator', 'Meeting Secretary']::public.user_role[]
  );
$$;

-- Enforce the read-only rule at the database boundary as well as in the API.
DROP POLICY IF EXISTS "suggestions_submit" ON public.suggestions;
CREATE POLICY "suggestions_submit"
ON public.suggestions
FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = (SELECT auth.uid())
  AND NOT public.has_governance_role(
    ARRAY['Super Admin', 'Director', 'Principal', 'HOD']::public.user_role[]
  )
);
