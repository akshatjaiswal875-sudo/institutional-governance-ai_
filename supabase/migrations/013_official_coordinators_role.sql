-- Official role naming: Coordinators.
-- Keep the legacy singular Coordinator accepted by authorization logic so existing code/data remain compatible.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'Coordinators';

CREATE OR REPLACE FUNCTION public.has_governance_role(allowed public.user_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM unnest(allowed) AS a(role)
    WHERE a.role = public.current_role()
       OR (a.role = 'Coordinator'::public.user_role AND public.current_role() = 'Coordinators'::public.user_role)
       OR (a.role = 'Coordinators'::public.user_role AND public.current_role() = 'Coordinator'::public.user_role)
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.can_assign_to(role_to public.user_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
declare r public.user_role;
begin
  r := public.current_role();
  if r in ('Director','Super Admin') then
    return role_to is not null;
  elsif r in ('Principal','Meeting Secretary') then
    return role_to in ('HOD','Coordinator','Coordinators','Faculty / Officer','Faculty / Volunteers','Member');
  elsif r in ('HOD','Coordinator','Coordinators') then
    return role_to in ('Faculty / Officer','Faculty / Volunteers','Member');
  else
    return false;
  end if;
end;
$$;
