-- Persist the in-memory worker job identifier so the UI can resume polling after refresh.
ALTER TABLE public.meeting_recordings
ADD COLUMN IF NOT EXISTS processing_job_id text;

CREATE INDEX IF NOT EXISTS meeting_recordings_processing_job_idx
ON public.meeting_recordings(processing_job_id)
WHERE processing_job_id IS NOT NULL;
