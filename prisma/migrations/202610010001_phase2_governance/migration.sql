-- Phase 2 governance data migration.
-- This migration is additive and preserves existing policy/event records.

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO counters(key, value) VALUES ('policy', 0), ('event', 0)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE policies ADD COLUMN IF NOT EXISTS custom_id TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS current_version_id UUID;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE events ADD COLUMN IF NOT EXISTS custom_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  change_summary VARCHAR(280),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT policy_versions_policy_version_unique UNIQUE(policy_id, version_number),
  CONSTRAINT policy_versions_version_positive CHECK(version_number > 0),
  CONSTRAINT policy_versions_summary_length CHECK(change_summary IS NULL OR char_length(change_summary) <= 280)
);

CREATE INDEX IF NOT EXISTS policy_versions_policy_created_idx
  ON policy_versions(policy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS policy_versions_creator_idx
  ON policy_versions(created_by);
CREATE INDEX IF NOT EXISTS policies_status_idx ON policies(status);
CREATE INDEX IF NOT EXISTS policies_deleted_idx ON policies(deleted_at);
CREATE INDEX IF NOT EXISTS events_deleted_idx ON events(deleted_at);
CREATE INDEX IF NOT EXISTS events_dates_idx ON events(start_time, end_time);

CREATE UNIQUE INDEX IF NOT EXISTS policies_custom_id_unique
  ON policies(custom_id) WHERE custom_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_custom_id_unique
  ON events(custom_id) WHERE custom_id IS NOT NULL;

-- Allocate immutable IDs for existing rows in creation order.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
  FROM policies
  WHERE custom_id IS NULL
)
UPDATE policies p
SET custom_id = 'PC-' || LPAD(numbered.n::text, 4, '0')
FROM numbered
WHERE p.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
  FROM events
  WHERE custom_id IS NULL
)
UPDATE events e
SET custom_id = 'EV-' || LPAD(numbered.n::text, 4, '0')
FROM numbered
WHERE e.id = numbered.id;

-- Move counters past all allocated legacy IDs so future allocations never collide.
UPDATE counters
SET value = GREATEST(value, COALESCE((
  SELECT MAX((SUBSTRING(custom_id FROM 4))::BIGINT) FROM policies WHERE custom_id IS NOT NULL
), 0)), "updatedAt" = NOW()
WHERE key = 'policy';

UPDATE counters
SET value = GREATEST(value, COALESCE((
  SELECT MAX((SUBSTRING(custom_id FROM 4))::BIGINT) FROM events WHERE custom_id IS NOT NULL
), 0)), "updatedAt" = NOW()
WHERE key = 'event';

ALTER TABLE policies ALTER COLUMN custom_id SET NOT NULL;
ALTER TABLE events ALTER COLUMN custom_id SET NOT NULL;

-- Create immutable v1 snapshots only for policies that do not already have versions.
INSERT INTO policy_versions(policy_id, version_number, title, content, change_summary, created_by)
SELECT
  p.id,
  1,
  p.title,
  p.content,
  'Initial version imported during governance migration',
  p.updated_by
FROM policies p
WHERE p.deleted_at IS NULL
  AND p.updated_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM policy_versions pv WHERE pv.policy_id = p.id
  );

-- Point each policy at its latest imported/current version.
UPDATE policies p
SET current_version_id = latest.id
FROM (
  SELECT DISTINCT ON (policy_id) id, policy_id
  FROM policy_versions
  ORDER BY policy_id, version_number DESC
) latest
WHERE p.id = latest.policy_id
  AND p.current_version_id IS NULL;

ALTER TABLE policies
  DROP CONSTRAINT IF EXISTS policies_current_version_fk;

ALTER TABLE policies
  ADD CONSTRAINT policies_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES policy_versions(id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS policies_current_version_unique
  ON policies(current_version_id)
  WHERE current_version_id IS NOT NULL;
