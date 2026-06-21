-- =============================================================================
-- Migration: 20260620000003_source_additions
-- Description: Batch 3 company seeding — Top 10 highest confidence additions
--              from the source expansion analysis (docs/source-expansion-plan.md
--              §6). Companies are purpose-selected for India, Singapore, UAE,
--              and Remote coverage to replace boards removed in batch 2 and to
--              expand overall source yield.
--
-- Grouped by ATS: Greenhouse (7), Lever (2), Ashby (1).
--
-- Idempotent: ON CONFLICT guard on the partial unique index
--             companies_source_token_uq (source, board_token WHERE NOT NULL)
--             means re-running this migration is safe.
--
-- Source: docs/source-expansion-plan.md §6 "Top 10 Highest Confidence Additions"
-- Date:   2026-06-20
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Greenhouse (6 companies)
-- ---------------------------------------------------------------------------

-- Samsara (greenhouse:samsara) — Priority #2
-- Established Hyderabad engineering hub; 200+ active roles; IoT/Backend/Platform.
INSERT INTO companies (name, source, board_token)
VALUES ('Samsara', 'greenhouse', 'samsara')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- Okta (greenhouse:okta) — Priority #4
-- 200+ roles across India and Singapore; SWE, Security Eng, Backend.
INSERT INTO companies (name, source, board_token)
VALUES ('Okta', 'greenhouse', 'okta')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- Glean (greenhouse:gleanwork) — Priority #5
-- AI search platform with dedicated "Backend Engineer - India" role listings in Bangalore.
INSERT INTO companies (name, source, board_token)
VALUES ('Glean', 'greenhouse', 'gleanwork')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- Adyen (greenhouse:adyen) — Priority #6
-- Singapore Java/Backend roles + Dubai presence; replaces UAE gap left by G42 removal.
INSERT INTO companies (name, source, board_token)
VALUES ('Adyen', 'greenhouse', 'adyen')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- Grafana Labs (greenhouse:grafanalabs) — Priority #7
-- Remote-first; "Senior Backend - India Remote" roles explicitly posted; O11y/Infra.
INSERT INTO companies (name, source, board_token)
VALUES ('Grafana Labs', 'greenhouse', 'grafanalabs')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- Moloco (greenhouse:moloco) — Priority #9
-- AI ad-tech; confirmed roles in Bengaluru, Gurgaon, and Singapore.
INSERT INTO companies (name, source, board_token)
VALUES ('Moloco', 'greenhouse', 'moloco')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- Careem (greenhouse:careem) — Priority #10
-- Super-app HQ in Dubai; fills the UAE gap after G42 and Kitopi removals.
INSERT INTO companies (name, source, board_token)
VALUES ('Careem', 'greenhouse', 'careem')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- ---------------------------------------------------------------------------
-- Lever (2 companies)
-- ---------------------------------------------------------------------------

-- Binance (lever:binance) — Priority #1
-- Highest-volume crypto employer across all 3 target regions; 500+ jobs including
-- Backend AI/LLM and Platform roles in Singapore, UAE, India, and Remote.
INSERT INTO companies (name, source, board_token)
VALUES ('Binance', 'lever', 'binance')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- Veeva Systems (lever:veeva) — Priority #8
-- 200+ roles; Hyderabad dev center covers India; also hires in Singapore.
-- Python/Java Backend and SWE roles confirmed active.
INSERT INTO companies (name, source, board_token)
VALUES ('Veeva Systems', 'lever', 'veeva')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;

-- ---------------------------------------------------------------------------
-- Ashby (1 company)
-- ---------------------------------------------------------------------------

-- Confluent (ashby:confluent) — Priority #3
-- 150+ roles; Bangalore engineering hub; replaces Loom in the Ashby slot.
-- Staff/Senior SWE, Data, and Platform roles across India, Singapore, and Remote.
INSERT INTO companies (name, source, board_token)
VALUES ('Confluent', 'ashby', 'confluent')
ON CONFLICT (source, board_token) WHERE board_token IS NOT NULL DO NOTHING;
