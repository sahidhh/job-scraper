-- ============================================================
-- source_repairs: fix 15 unhealthy ATS board tokens and migrate
-- 4 companies from their old ATS to Lever.
--
-- Sections:
--   4.1 Token corrections (same ATS)          — 2 companies
--   4.2 Transient/stale probe reset            — 9 companies
--   4.3 ATS migrations → Lever                 — 4 companies
--
-- All repaired rows have health_status reset to 'active' and
-- consecutive_failures reset to 0 so they are included in the
-- next probe cycle. No rows are deleted.
-- ============================================================

-- ------------------------------------------------------------
-- 4.1  Token corrections (same ATS, board_token was wrong)
-- ------------------------------------------------------------

-- Razorpay: Greenhouse token changed after entity rename
update companies
set
  board_token          = 'razorpaysoftwareprivatelimited',
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Razorpay'
  and source = 'greenhouse';

-- Gojek: post-merger identity; board now lives under GoToGroup token
update companies
set
  board_token          = 'GoToGroup',
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Gojek'
  and source = 'lever';

-- ------------------------------------------------------------
-- 4.2  Transient / stale probe failures — reset health state only
--      (tokens are already correct; boards confirmed live)
-- ------------------------------------------------------------

-- Meesho (Lever: meesho) — 47+ open roles confirmed
update companies
set
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Meesho'
  and source = 'lever';

-- Xendit (Greenhouse: xendit) — live at boards.greenhouse.io/xendit
update companies
set
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Xendit'
  and source = 'greenhouse';

-- Aspire (Greenhouse: aspire) — live at job-boards.greenhouse.io/aspire
update companies
set
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Aspire'
  and source = 'greenhouse';

-- Innovaccer (Greenhouse: innovaccer) — live at job-boards.greenhouse.io/innovaccer
update companies
set
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Innovaccer'
  and source = 'greenhouse';

-- PhonePe (Greenhouse: phonepe) — live board confirmed
update companies
set
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'PhonePe'
  and source = 'greenhouse';

-- Retool (Greenhouse: retool) — live at job-boards.greenhouse.io/retool
update companies
set
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Retool'
  and source = 'greenhouse';

-- Brex (Greenhouse: brex) — live at job-boards.greenhouse.io/brex
update companies
set
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Brex'
  and source = 'greenhouse';

-- Mercury (Greenhouse: mercury) — live at job-boards.greenhouse.io/mercury
update companies
set
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Mercury'
  and source = 'greenhouse';

-- Postman (Greenhouse: postman) — live at job-boards.greenhouse.io/postman
update companies
set
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Postman'
  and source = 'greenhouse';

-- ------------------------------------------------------------
-- 4.3  ATS migrations — companies that moved to Lever
--      Match on old (name, source) to avoid touching any future
--      re-seeded row that already has the corrected source.
-- ------------------------------------------------------------

-- CRED: was ashby:dreamplug → lever:cred
update companies
set
  source               = 'lever',
  board_token          = 'cred',
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'CRED'
  and source = 'ashby';

-- Kitopi: was greenhouse:kitopi → lever:kitopi
update companies
set
  source               = 'lever',
  board_token          = 'kitopi',
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Kitopi'
  and source = 'greenhouse';

-- Nium: was greenhouse:nium → lever:nium
update companies
set
  source               = 'lever',
  board_token          = 'nium',
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'Nium'
  and source = 'greenhouse';

-- CleverTap: was greenhouse:clevertap → lever:clevertap
update companies
set
  source               = 'lever',
  board_token          = 'clevertap',
  health_status        = 'active',
  consecutive_failures = 0
where name   = 'CleverTap'
  and source = 'greenhouse';
