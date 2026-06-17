-- Batch 2: YC startups + Bangalore / Singapore / Abu Dhabi additions.
-- Tokens verified against public ATS URLs. ON CONFLICT = safe to re-run.
-- After first scrape, check scrape_runs for failed sources and remove bad tokens.

insert into companies (name, source, board_token) values

  -- ── YC / well-funded (remote-friendly, hire India/SG engineers) ──────────
  ('Rippling',     'greenhouse', 'rippling'),     -- HR platform, big Bangalore R&D
  ('Deel',         'greenhouse', 'deel'),          -- remote hiring, hires globally
  ('Retool',       'greenhouse', 'retool'),        -- dev tools, YC W17
  ('GitLab',       'greenhouse', 'gitlab'),        -- fully remote, large eng team
  ('Brex',         'greenhouse', 'brex'),          -- YC fintech
  ('Mercury',      'greenhouse', 'mercury'),       -- YC fintech, remote eng

  -- ── Bangalore startups ───────────────────────────────────────────────────
  ('MoEngage',     'greenhouse', 'moengage'),      -- marketing automation
  ('CleverTap',    'greenhouse', 'clevertap'),     -- analytics platform
  ('Hasura',       'greenhouse', 'hasura'),        -- GraphQL engine, YC W18
  ('Innovaccer',   'greenhouse', 'innovaccer'),    -- health AI, Bangalore + US
  ('CRED',         'ashby',      'dreamplug'),     -- fintech (legal entity: Dreamplug)
  ('PhonePe',      'greenhouse', 'phonepe'),       -- payments unicorn

  -- ── Singapore startups ───────────────────────────────────────────────────
  ('Nium',         'greenhouse', 'nium'),          -- fintech unicorn, SG HQ
  ('Xendit',       'greenhouse', 'xendit'),        -- SE Asia payments
  ('StashAway',    'greenhouse', 'stashaway'),     -- wealthtech, SG
  ('PropertyGuru', 'greenhouse', 'propertyguru'),  -- real estate portal
  ('Aspire',       'greenhouse', 'aspire'),        -- neobank for SMBs
  ('Syfe',         'ashby',      'syfe'),          -- wealthtech, SG

  -- ── Abu Dhabi startups ───────────────────────────────────────────────────
  ('G42',          'greenhouse', 'g42'),           -- AI/cloud, Abu Dhabi
  ('Kitopi',       'greenhouse', 'kitopi')         -- cloud kitchens, UAE

on conflict (source, board_token) where board_token is not null do nothing;
