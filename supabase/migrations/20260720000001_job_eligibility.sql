-- Persisted eligibility verdict (docs/decisions.md AD-50). Until now
-- classifyEligibility.ts was recomputed in memory at scoring time and thrown
-- away, which meant (a) the dashboard could not filter on it, and (b)
-- findUnscored had no way to exclude hard-excluded jobs, so every score run
-- re-fetched and re-wrote them forever (the second scoring loop -- see
-- docs/fixes/scoring-loop-fix.md).
--
-- null = eligible. The value set lives in TypeScript (IneligibleReason,
-- src/features/scoring/domain/classifyEligibility.ts), same convention as
-- jobs.employment_type / jobs.salary_period -- no DB enum.
alter table jobs add column ineligible_reason text;

-- Read paths: findUnscored's candidate query and findForDashboard's
-- default-on "hide jobs I can't apply to" filter both test this column,
-- overwhelmingly for `is null`.
create index jobs_ineligible_reason_idx on jobs (ineligible_reason);
