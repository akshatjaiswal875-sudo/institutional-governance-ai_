# Institutional Governance Upgrade

## Core flow

Meeting/Event -> AI processing -> human review -> approval -> decisions/action items -> policy/version history -> audit -> searchable institutional memory.

## Added in this upgrade

- Policy version history with immutable snapshots.
- Policy-to-decision traceability links.
- Per-user notification inbox.
- Indexes for governance foreign keys and notification lookups.
- Safer institutional keyword search function.
- Locked-down SECURITY DEFINER authorization helpers.
- Service-role grants required by server-only event/recording APIs.
- Authenticated event reads.
- Initial policy version snapshot on policy creation.
- Policy version history API.

## Next implementation targets

1. Meeting approval UI: Draft -> Transcribed -> Pending Approval -> Approved/Rejected -> Published.
2. Decision -> action item lifecycle with assignee, deadline, overdue state and completion evidence.
3. Meeting -> decision -> policy linking UI.
4. Event archive for speeches, presentations, recordings and reports.
5. Global search with filters and source-aware RAG answers.
6. Dashboard analytics and periodic governance reports.
7. Notification triggers for approvals, deadlines, upcoming meetings and policy changes.
8. End-to-end testing of auth, RLS, storage, AI processing and Vercel production routes.
