-- Dashboard quick-action buttons (Not Interested/Viewed/Applied/Archive) and
-- the status-dropdown toggle. The dislike button used to write "Rejected";
-- it now writes "Not Interested" -- rename in place so existing jobs already
-- marked keep their history instead of losing it to a fresh, disconnected row.

update job_statuses set label = 'Not Interested' where label = 'Rejected';

-- "Viewed" is new. Appended after the current max sort_order, same as
-- createStatusAction does for a status added via Settings -- existing rows'
-- ordering is untouched.
insert into job_statuses (label, color, sort_order)
select 'Viewed', '#EDE9FE', (select coalesce(max(sort_order), -1) + 1 from job_statuses)
where not exists (select 1 from job_statuses where label = 'Viewed');

-- show_status_dropdown: reuses the existing app_settings key/value table
-- (20260616000002_experience.sql) -- no new table needed, same pattern as
-- skip_unsponsored_foreign_jobs. No seed row:
-- SupabaseSettingsRepository.getShowStatusDropdown() treats a missing row as
-- "on" (the default), same convention as skip_unsponsored_foreign_jobs
-- treats a missing row as "off".
