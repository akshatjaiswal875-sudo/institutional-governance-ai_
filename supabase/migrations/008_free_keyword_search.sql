-- Free search replacement for the OpenAI-dependent hybrid_search endpoint.
-- This keeps the existing embeddings/RAG infrastructure intact for other features,
-- but the /api/search route no longer requires OPENAI_API_KEY.

CREATE OR REPLACE FUNCTION public.keyword_search(
  query_text text,
  match_count integer DEFAULT 20
)
RETURNS TABLE(
  parent_type text,
  parent_id uuid,
  chunk_content text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT
      trim(query_text) AS text,
      websearch_to_tsquery('english', trim(query_text)) AS tsq
  ),
  candidates AS (
    -- Meetings
    SELECT
      'meeting'::text AS parent_type,
      m.id AS parent_id,
      concat_ws(E'\n', m.title, m.location, m.status::text) AS chunk_content,
      jsonb_build_object(
        'source', 'meeting',
        'title', m.title,
        'date', m.date,
        'location', m.location,
        'status', m.status
      ) AS metadata,
      GREATEST(
        ts_rank(to_tsvector('english', concat_ws(' ', m.title, m.location, m.status::text)), q.tsq),
        CASE WHEN lower(concat_ws(' ', m.title, m.location)) LIKE '%' || lower(q.text) || '%' THEN 0.9 ELSE 0 END
      )::double precision AS similarity
    FROM public.meetings m
    CROSS JOIN q
    WHERE q.text <> ''
      AND (
        to_tsvector('english', concat_ws(' ', m.title, m.location, m.status::text)) @@ q.tsq
        OR lower(concat_ws(' ', m.title, m.location)) LIKE '%' || lower(q.text) || '%'
      )

    UNION ALL

    -- Recordings / filenames
    SELECT
      'meeting_recording'::text,
      r.id,
      concat_ws(E'\n', r.original_filename, r.mime_type, r.status::text) AS chunk_content,
      jsonb_build_object(
        'source', 'meeting_recording',
        'meeting_id', r.meeting_id,
        'filename', r.original_filename,
        'status', r.status
      ),
      GREATEST(
        ts_rank(to_tsvector('english', concat_ws(' ', r.original_filename, r.mime_type, r.status::text)), q.tsq),
        CASE WHEN lower(r.original_filename) LIKE '%' || lower(q.text) || '%' THEN 0.95 ELSE 0 END
      )::double precision
    FROM public.meeting_recordings r
    CROSS JOIN q
    WHERE q.text <> ''
      AND (
        to_tsvector('english', concat_ws(' ', r.original_filename, r.mime_type, r.status::text)) @@ q.tsq
        OR lower(r.original_filename) LIKE '%' || lower(q.text) || '%'
      )

    UNION ALL

    -- Transcripts
    SELECT
      'meeting_transcript'::text,
      t.id,
      left(t.transcript, 4000),
      jsonb_build_object(
        'source', 'meeting_transcript',
        'meeting_id', t.meeting_id,
        'recording_id', t.recording_id,
        'status', t.status
      ),
      ts_rank(to_tsvector('english', t.transcript), q.tsq)::double precision
    FROM public.meeting_transcripts t
    CROSS JOIN q
    WHERE q.text <> ''
      AND to_tsvector('english', t.transcript) @@ q.tsq

    UNION ALL

    -- AI summaries / suggested minutes
    SELECT
      'meeting_ai_analysis'::text,
      a.id,
      left(concat_ws(E'\n', a.summary, a.suggested_minutes), 4000),
      jsonb_build_object(
        'source', 'meeting_ai_analysis',
        'meeting_id', a.meeting_id,
        'transcript_id', a.transcript_id,
        'status', a.status
      ),
      ts_rank(to_tsvector('english', concat_ws(' ', a.summary, a.suggested_minutes)), q.tsq)::double precision
    FROM public.meeting_ai_analysis a
    CROSS JOIN q
    WHERE q.text <> ''
      AND to_tsvector('english', concat_ws(' ', a.summary, a.suggested_minutes)) @@ q.tsq

    UNION ALL

    -- Decisions and action items
    SELECT
      'decision'::text,
      d.id,
      concat_ws(E'\n', d.decision_text, d.action_item),
      jsonb_build_object(
        'source', 'decision',
        'meeting_id', d.meeting_id,
        'minute_id', d.minute_id,
        'assignee_id', d.assignee_id,
        'due_date', d.due_date,
        'status', d.status
      ),
      ts_rank(to_tsvector('english', concat_ws(' ', d.decision_text, d.action_item)), q.tsq)::double precision
    FROM public.decisions d
    CROSS JOIN q
    WHERE q.text <> ''
      AND to_tsvector('english', concat_ws(' ', d.decision_text, d.action_item)) @@ q.tsq

    UNION ALL

    -- Policies
    SELECT
      'policy'::text,
      p.id,
      left(concat_ws(E'\n', p.title, p.content), 4000),
      jsonb_build_object(
        'source', 'policy',
        'title', p.title,
        'status', p.status,
        'version', p.version
      ),
      GREATEST(
        ts_rank(to_tsvector('english', concat_ws(' ', p.title, p.content)), q.tsq),
        CASE WHEN lower(concat_ws(' ', p.title, p.content)) LIKE '%' || lower(q.text) || '%' THEN 0.9 ELSE 0 END
      )::double precision
    FROM public.policies p
    CROSS JOIN q
    WHERE q.text <> ''
      AND (
        to_tsvector('english', concat_ws(' ', p.title, p.content)) @@ q.tsq
        OR lower(concat_ws(' ', p.title, p.content)) LIKE '%' || lower(q.text) || '%'
      )
  )
  SELECT c.parent_type, c.parent_id, c.chunk_content, c.metadata, c.similarity
  FROM candidates c
  WHERE c.similarity > 0
  ORDER BY c.similarity DESC
  LIMIT GREATEST(1, LEAST(match_count, 100));
$$;

GRANT EXECUTE ON FUNCTION public.keyword_search(text, integer) TO authenticated;
