-- Contact email extraction (Phase 2 Task 9, see
-- src/features/jobs/domain/extractContactEmail.ts). Category/confidence are
-- plain text -- fixed value sets live in TypeScript (EmailCategory:
-- recruiter|hr|hiring_manager|company_contact; EmailConfidence:
-- high|medium|low) -- same convention as scrape_runs.failure_category.
alter table jobs
  add column contact_email text,
  add column contact_email_category text,
  add column contact_email_confidence text;
