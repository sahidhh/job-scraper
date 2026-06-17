-- Seed target companies for Bangalore / Singapore / Chennai hiring.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

insert into companies (name, source, board_token) values
  -- Greenhouse
  ('Freshworks',   'greenhouse', 'freshworks'),
  ('Grab',         'greenhouse', 'grab'),
  ('Stripe',       'greenhouse', 'stripe'),
  ('Razorpay',     'greenhouse', 'razorpay'),
  ('Postman',      'greenhouse', 'postman'),
  ('BrowserStack', 'greenhouse', 'browserstack'),
  ('Chargebee',    'greenhouse', 'chargebee'),
  ('Swiggy',       'greenhouse', 'swiggy'),
  ('Revolut',      'greenhouse', 'revolut'),
  ('Wise',         'greenhouse', 'wise'),
  ('Carousell',    'greenhouse', 'carousell'),

  -- Lever
  ('Gojek',        'lever', 'gojek'),
  ('Meesho',       'lever', 'meesho'),

  -- Ashby
  ('Linear',       'ashby', 'linear'),
  ('Vercel',       'ashby', 'vercel'),
  ('Loom',         'ashby', 'loom')

on conflict (source, board_token) where board_token is not null do nothing;
