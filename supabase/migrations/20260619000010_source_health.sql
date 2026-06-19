-- Source health tracking: consecutive failures, last seen timestamps, lifecycle status
-- Status: active (normal), unhealthy (failing but not yet disabled), disabled (auto-disabled after threshold)
CREATE TYPE source_health_status AS ENUM ('active', 'unhealthy', 'disabled');

ALTER TABLE companies
  ADD COLUMN health_status source_health_status NOT NULL DEFAULT 'active',
  ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN last_success_at timestamptz,
  ADD COLUMN last_failure_at timestamptz;

CREATE INDEX companies_health_status_idx ON companies (health_status);
