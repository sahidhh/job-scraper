ALTER TABLE digest_sessions
  ADD COLUMN resume_version integer NOT NULL DEFAULT 0;
