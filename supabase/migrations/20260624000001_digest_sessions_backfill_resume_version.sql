-- Backfill resume_version on digest_sessions rows created before
-- 20260622000002 added the column (those rows got DEFAULT 0).
-- Sets every session's resume_version to the currently active resume's
-- version so the webhook job query (which filters on resume_version)
-- can match actual job_scores rows again.
--
-- Safe to re-run: sessions already on the correct version are unchanged.
UPDATE digest_sessions
SET resume_version = (
  SELECT version FROM resumes WHERE is_active = true LIMIT 1
)
WHERE resume_version = 0;
