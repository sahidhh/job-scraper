-- =============================================================================
-- Migration: 20260620000002_source_removals
-- Description: Soft-delete 10 companies whose ATS boards are no longer
--              scrapable. These companies have migrated to unsupported
--              platforms (Workday, SmartRecruiters, Trakstar, Kula.ai,
--              proprietary portals) or have no discoverable public ATS board.
--
-- Strategy: Set active = false and health_status = 'disabled' to prevent
--           further scrape attempts and health-probe noise. Rows are NOT
--           deleted — this preserves job history foreign key references.
--
-- Idempotent: Running this migration more than once is safe; UPDATE to an
--             already-set value is a no-op in terms of data effect.
--
-- Source: docs/source-expansion-plan.md §3 "Companies to Remove"
-- Date:   2026-06-20
-- =============================================================================

-- Loom (ashby:loom)
-- Acquired by Atlassian Nov 2023; Loom brand absorbed — no independent job board.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'Loom' AND source = 'ashby';

-- Swiggy (greenhouse:swiggy)
-- Uses proprietary portal (careers.swiggy.com); not on any supported ATS.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'Swiggy' AND source = 'greenhouse';

-- Chargebee (greenhouse:chargebee)
-- Self-hosted careers page (jobs.chargebee.com); no public Greenhouse/Lever/Ashby board.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'Chargebee' AND source = 'greenhouse';

-- Carousell (greenhouse:carousell)
-- Migrated to SmartRecruiters (careers.smartrecruiters.com/carousellgroup) — not scrapable.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'Carousell' AND source = 'greenhouse';

-- Hasura (greenhouse:hasura)
-- No discoverable public ATS board on any of the 3 supported platforms.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'Hasura' AND source = 'greenhouse';

-- MoEngage (greenhouse:moengage)
-- Migrated to Trakstar (moengage.hire.trakstar.com) — not scrapable.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'MoEngage' AND source = 'greenhouse';

-- StashAway (greenhouse:stashaway)
-- Migrated to Kula.ai (careers.kula.ai/stashaway) — not scrapable.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'StashAway' AND source = 'greenhouse';

-- PropertyGuru (greenhouse:propertyguru)
-- Migrated to Workday (propertyguru.wd105.myworkdayjobs.com) — not scrapable.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'PropertyGuru' AND source = 'greenhouse';

-- Syfe (ashby:syfe)
-- Uses syfe.careers-page.com (Keka or similar non-standard ATS); not on Ashby.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'Syfe' AND source = 'ashby';

-- G42 (greenhouse:g42)
-- Uses proprietary careers.g42.ai portal; no Greenhouse/Lever/Ashby board found.
UPDATE companies
SET active = false, health_status = 'disabled'
WHERE name = 'G42' AND source = 'greenhouse';
