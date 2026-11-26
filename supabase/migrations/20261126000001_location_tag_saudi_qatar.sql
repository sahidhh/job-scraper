-- Add Saudi Arabia and Qatar location tags (task #226, owner-approved).
-- NaukriGulf actor searches UAE, Saudi Arabia, Qatar (country codes 17/14/13).
--
-- Rollback notes:
-- - Postgres cannot drop enum values without recreating the type. Leaving
--   unused values in place is harmless; code simply never emits them.
ALTER TYPE location_tag ADD VALUE IF NOT EXISTS 'saudi';
ALTER TYPE location_tag ADD VALUE IF NOT EXISTS 'qatar';
