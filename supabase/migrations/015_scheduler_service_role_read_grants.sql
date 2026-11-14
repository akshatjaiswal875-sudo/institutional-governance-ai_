-- Grant the server-side scheduler read access to scheduling profile tables.
-- The API uses the Supabase service_role client and still enforces authorization
-- in the application layer; RLS remains enabled for authenticated self-service access.

grant usage on schema public to service_role;
grant select on table
  public.user_availability,
  public.user_scheduling_preferences,
  public.user_unavailability
to service_role;
