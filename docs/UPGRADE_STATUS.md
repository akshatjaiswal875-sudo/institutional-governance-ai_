# Upgrade Status

Completed in connected Supabase production project:
- Policy history tables and RLS.
- Policy-decision links and RLS.
- Notification table and RLS.
- Governance indexes.
- Service-role grants for server-only governance APIs.
- Security hardening for internal SECURITY DEFINER helpers.
- Safer hybrid/institutional search function.

Completed on the upgrade branch:
- Authenticated event GET endpoint.
- Initial policy-version snapshot on policy creation.
- Policy history API.
- Notification inbox API.
- Governance domain types.
- Migration files documenting the database changes.

Known production configuration item:
- Supabase Auth leaked-password protection is disabled; enable it in the Supabase Auth password-security settings.
