-- Naukri-in-a-Box pipeline migration (T001 / REQ-F001, REQ-F003, REQ-F008)
--
-- 1. Rename job_source 'claude_routine' -> 'routine_agent' and add 'naukri', 'naukrigulf'.
-- 2. Seed app_settings.enabled_sources = ["naukri", "naukrigulf"] if absent.
-- 3. Update set_active_role_selection RPC to deterministically reuse an existing
--    role_selections row matching normalized (primary_role, expanded_roles).
--
-- Rollback notes:
-- - Enum values cannot be removed in Postgres without recreating the type;
--   to revert the rename: ALTER TYPE job_source RENAME VALUE 'routine_agent' TO 'claude_routine';
-- - To revert app_settings seed: DELETE FROM app_settings WHERE key = 'enabled_sources';
-- - To revert set_active_role_selection: restore definition from 20260612000006_fix_rpc_return_types.sql.

-- 1. Enum rename and additions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'job_source'
      AND e.enumlabel = 'claude_routine'
  ) THEN
    ALTER TYPE job_source RENAME VALUE 'claude_routine' TO 'routine_agent';
  END IF;
END $$;

ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'naukri';
ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'naukrigulf';

-- 2. Default enabled_sources setting
INSERT INTO app_settings (key, value)
VALUES ('enabled_sources', '["naukri","naukrigulf"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Deterministic set_active_role_selection
DROP FUNCTION IF EXISTS set_active_role_selection(text, text[]);

CREATE FUNCTION set_active_role_selection(
  p_primary_role   text,
  p_expanded_roles text[]
)
RETURNS SETOF role_selections
LANGUAGE plpgsql
AS $$
DECLARE
  result          role_selections;
  v_norm_primary  text;
  v_norm_expanded text[];
BEGIN
  v_norm_primary := lower(trim(coalesce(p_primary_role, '')));

  SELECT coalesce(array_agg(r ORDER BY r), '{}'::text[])
  INTO v_norm_expanded
  FROM (
    SELECT DISTINCT lower(trim(x)) AS r
    FROM unnest(coalesce(p_expanded_roles, '{}'::text[])) AS x
    WHERE trim(x) <> ''
  ) s;

  UPDATE role_selections
  SET is_active = false
  WHERE is_active = true;

  SELECT *
  INTO result
  FROM role_selections rs
  WHERE lower(trim(coalesce(rs.primary_role, ''))) = v_norm_primary
    AND (
      SELECT coalesce(array_agg(r ORDER BY r), '{}'::text[])
      FROM (
        SELECT DISTINCT lower(trim(x)) AS r
        FROM unnest(coalesce(rs.expanded_roles, '{}'::text[])) AS x
        WHERE trim(x) <> ''
      ) s
    ) = v_norm_expanded
  ORDER BY rs.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE role_selections
    SET is_active = true
    WHERE id = result.id
    RETURNING * INTO result;
  ELSE
    INSERT INTO role_selections (primary_role, expanded_roles, is_active)
    VALUES (p_primary_role, p_expanded_roles, true)
    RETURNING * INTO result;
  END IF;

  RETURN NEXT result;
  RETURN;
END;
$$;
