-- SECURITY DEFINER helpers are internal authorization primitives, not public RPCs.
revoke execute on function public.current_role() from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
