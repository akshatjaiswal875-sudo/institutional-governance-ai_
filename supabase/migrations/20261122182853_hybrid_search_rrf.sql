-- Improve hybrid retrieval by fusing semantic and lexical ranks (RRF).
-- Keep the existing embeddings RLS policies unchanged: they encode the
-- institution's meeting membership, approved-policy, and published-event rules.
-- SECURITY INVOKER ensures this function runs with the caller's table privileges
-- and remains subject to embeddings RLS.
DROP FUNCTION IF EXISTS public.hybrid_search(text, vector, integer);
CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_text text,
  query_embedding vector(1536),
  match_count integer DEFAULT 10
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
SECURITY INVOKER
SET search_path = public, extensions
AS $$
WITH bounded AS (
  SELECT GREATEST(1, LEAST(COALESCE(match_count, 10), 50)) AS n
),
semantic AS (
  SELECT e.id, e.parent_type, e.parent_id, e.chunk_content, e.metadata,
         ROW_NUMBER() OVER (ORDER BY e.embedding <=> query_embedding) AS rank_no
  FROM public.embeddings e
  WHERE query_embedding IS NOT NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT (SELECT n * 3 FROM bounded)
),
lexical AS (
  SELECT e.id, e.parent_type, e.parent_id, e.chunk_content, e.metadata,
         ROW_NUMBER() OVER (
           ORDER BY ts_rank_cd(
             to_tsvector('english', coalesce(e.chunk_content, '')),
             websearch_to_tsquery('english', coalesce(query_text, ''))
           ) DESC
         ) AS rank_no
  FROM public.embeddings e
  WHERE coalesce(trim(query_text), '') <> ''
    AND to_tsvector('english', coalesce(e.chunk_content, ''))
        @@ websearch_to_tsquery('english', query_text)
  ORDER BY ts_rank_cd(
    to_tsvector('english', coalesce(e.chunk_content, '')),
    websearch_to_tsquery('english', query_text)
  ) DESC
  LIMIT (SELECT n * 3 FROM bounded)
),
fused AS (
  SELECT id, parent_type, parent_id, chunk_content, metadata,
         SUM(1.0 / (60 + rank_no)) AS rrf_score
  FROM (
    SELECT * FROM semantic
    UNION ALL
    SELECT * FROM lexical
  ) ranked
  GROUP BY id, parent_type, parent_id, chunk_content, metadata
)
SELECT f.parent_type, f.parent_id, f.chunk_content, f.metadata,
       f.rrf_score::double precision AS similarity
FROM fused f
ORDER BY f.rrf_score DESC
LIMIT (SELECT n FROM bounded);
$$;

GRANT EXECUTE ON FUNCTION public.hybrid_search(text, vector, integer) TO authenticated;
