-- The global governance search RPC is SECURITY INVOKER. It must have
-- table-level SELECT grants for every relation it reads; RLS continues to
-- enforce which suggestion rows and tag rows each authenticated user can see.
grant select on table
  public.suggestions,
  public.suggestion_policy_tags,
  public.suggestion_event_tags
to authenticated;
