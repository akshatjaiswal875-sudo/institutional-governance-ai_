-- Calendar scheduler reads participant availability and schedules through the server-side admin client.
-- Keep these grants explicit so a fresh environment preserves the same runtime permissions.
GRANT SELECT ON TABLE public.events TO service_role;
GRANT SELECT ON TABLE public.user_availability TO service_role;
GRANT SELECT ON TABLE public.users TO service_role;
GRANT SELECT ON TABLE public.meetings TO service_role;
GRANT SELECT ON TABLE public.participants TO service_role;
