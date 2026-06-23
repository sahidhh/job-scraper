-- Defensive constraint: application already clamps 0-20 but this guards
-- against future code paths writing out-of-range values silently.
alter table jobs
  add constraint jobs_min_years_range
  check (min_years is null or (min_years >= 0 and min_years <= 20));
