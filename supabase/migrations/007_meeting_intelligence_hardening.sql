-- Production hardening for meeting intelligence.
-- Safe to apply after 006_ai_meeting_intelligence.sql.

-- One active recording may exist per meeting. Existing data is not deleted here;
-- resolve any duplicate active rows before applying this unique index in production.
CREATE UNIQUE INDEX IF NOT EXISTS meeting_recordings_one_active_idx
ON public.meeting_recordings (meeting_id)
WHERE status IN ('uploaded','processing','transcribing','analyzing','completed');

-- Make retries converge on one transcript/analysis for a recording.
CREATE UNIQUE INDEX IF NOT EXISTS meeting_transcripts_recording_unique_idx
ON public.meeting_transcripts (recording_id);

CREATE UNIQUE INDEX IF NOT EXISTS meeting_ai_analysis_transcript_unique_idx
ON public.meeting_ai_analysis (transcript_id);

-- Tighten storage access: the object path must identify an actual meeting the
-- authenticated user is allowed to access. The previous policy accepted any
-- object under meetings/ for any authenticated user.
DROP POLICY IF EXISTS meeting_media_authenticated_read ON storage.objects;
CREATE POLICY meeting_media_authenticated_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meeting-media'
  AND EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE m.id::text = (storage.foldername(name))[2]
      AND (
        public.is_staff()
        OR m.status = 'Published'
        OR m.created_by = auth.uid()
        OR m.assigned_approver_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.participants p
          WHERE p.meeting_id = m.id
            AND p.user_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS meeting_media_authenticated_upload ON storage.objects;
CREATE POLICY meeting_media_authenticated_upload
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meeting-media'
  AND public.current_role() IN ('Super Admin', 'Meeting Secretary')
  AND (storage.foldername(name))[1] = 'meetings'
  AND EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE m.id::text = (storage.foldername(name))[2]
      AND m.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS meeting_media_authenticated_update ON storage.objects;
CREATE POLICY meeting_media_authenticated_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'meeting-media'
  AND public.current_role() IN ('Super Admin', 'Meeting Secretary')
  AND EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE m.id::text = (storage.foldername(name))[2]
      AND (m.created_by = auth.uid() OR public.current_role() = 'Super Admin')
  )
)
WITH CHECK (
  bucket_id = 'meeting-media'
  AND (storage.foldername(name))[1] = 'meetings'
);

DROP POLICY IF EXISTS meeting_media_authenticated_delete ON storage.objects;
CREATE POLICY meeting_media_authenticated_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'meeting-media'
  AND public.current_role() IN ('Super Admin', 'Meeting Secretary')
  AND EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE m.id::text = (storage.foldername(name))[2]
      AND (m.created_by = auth.uid() OR public.current_role() = 'Super Admin')
  )
);
