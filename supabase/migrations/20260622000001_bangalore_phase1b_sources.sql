-- =============================================================================
-- Migration: 20260622000001_bangalore_phase1b_sources
-- Description: Phase 1B — Bangalore source expansion.
--              Adds 4 Bangalore-focused companies identified in the source
--              strategy review (docs/research/source-strategy-review.md §Tier 1).
--              All use already-supported ATS platforms (Greenhouse, Lever).
--              No code changes required.
--
-- Grouped by ATS: Greenhouse (2), Lever (2).
--
-- Idempotent: ON CONFLICT guard on the partial unique index
--             companies_source_token_uq (source, board_token WHERE NOT NULL)
--             means re-running this migration is safe.
--
-- Source: docs/research/source-strategy-review.md §"Gaps: High-Value Bangalore Sources"
-- Date:   2026-06-22
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Greenhouse (2 companies)
-- ---------------------------------------------------------------------------

-- HackerRank (greenhouse:hackerrank) — Tier 1, HIGH confidence
-- Bangalore office; "Backend Engineer II, hybrid BLR" roles explicitly posted.
INSERT INTO companies (name, source, board_token)
VALUES ('HackerRank', 'greenhouse', 'hackerrank')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- CommerceIQ (greenhouse:commerceiq) — Tier 1, HIGH confidence
-- Bangalore HQ; Series D startup; active SDE I/II/Senior Backend pipeline.
INSERT INTO companies (name, source, board_token)
VALUES ('CommerceIQ', 'greenhouse', 'commerceiq')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- ---------------------------------------------------------------------------
-- Lever (2 companies)
-- ---------------------------------------------------------------------------

-- Hevo Data (lever:hevodata) — Tier 1, HIGH confidence
-- Bangalore HQ; data engineering platform; 29 confirmed active roles including
-- SDE II/III. Primary Bangalore data-engineering coverage.
INSERT INTO companies (name, source, board_token)
VALUES ('Hevo Data', 'lever', 'hevodata')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- Stable Money (lever:stable-money1) — Tier 1, MEDIUM confidence
-- Bangalore fintech startup; SWE/Senior Backend roles; small board volume.
-- Token uses non-standard slug format; run validate-sources to confirm.
INSERT INTO companies (name, source, board_token)
VALUES ('Stable Money', 'lever', 'stable-money1')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;
