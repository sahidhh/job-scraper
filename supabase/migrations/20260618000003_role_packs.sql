-- Role Packs: pre-defined, reusable groupings of related job titles.
-- Selecting a pack expands into multiple roles and calls the existing
-- set_active_role_selection flow unchanged (docs/tasks/role-packs.md).

-- ============================================================
-- role_packs: top-level pack definition
-- ============================================================
create table role_packs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- role_pack_roles: individual role terms that belong to a pack
-- ============================================================
create table role_pack_roles (
  id         uuid primary key default gen_random_uuid(),
  pack_id    uuid not null references role_packs(id) on delete cascade,
  role       text not null,
  sort_order integer not null default 0
);

create index role_pack_roles_pack_id_idx on role_pack_roles(pack_id);

-- ============================================================
-- RLS: authenticated users can read; writes are service-role only
-- ============================================================
alter table role_packs enable row level security;
alter table role_pack_roles enable row level security;

create policy "authenticated users can read role_packs"
  on role_packs for select
  to authenticated
  using (true);

create policy "authenticated users can read role_pack_roles"
  on role_pack_roles for select
  to authenticated
  using (true);

-- ============================================================
-- Seed data: curated packs for common engineering personas
-- ============================================================
do $$
declare
  pack_id uuid;
begin

  -- Full Stack Pack
  insert into role_packs (name, description) values (
    'Full Stack Pack',
    'Covers frontend, backend, and full-stack engineering titles'
  ) returning id into pack_id;
  insert into role_pack_roles (pack_id, role, sort_order) values
    (pack_id, 'Full Stack Engineer',    0),
    (pack_id, 'Full Stack Developer',   1),
    (pack_id, 'Software Engineer',      2),
    (pack_id, 'Frontend Developer',     3),
    (pack_id, 'Backend Developer',      4),
    (pack_id, 'React Developer',        5),
    (pack_id, 'Node.js Developer',      6),
    (pack_id, 'Web Developer',          7);

  -- Frontend Pack
  insert into role_packs (name, description) values (
    'Frontend Pack',
    'UI/UX engineering and browser-focused roles'
  ) returning id into pack_id;
  insert into role_pack_roles (pack_id, role, sort_order) values
    (pack_id, 'Frontend Engineer',      0),
    (pack_id, 'Frontend Developer',     1),
    (pack_id, 'React Developer',        2),
    (pack_id, 'UI Engineer',            3),
    (pack_id, 'JavaScript Developer',   4),
    (pack_id, 'TypeScript Developer',   5),
    (pack_id, 'Next.js Developer',      6);

  -- Backend Pack
  insert into role_packs (name, description) values (
    'Backend Pack',
    'Server-side, API, and systems engineering titles'
  ) returning id into pack_id;
  insert into role_pack_roles (pack_id, role, sort_order) values
    (pack_id, 'Backend Engineer',       0),
    (pack_id, 'Backend Developer',      1),
    (pack_id, 'Software Engineer',      2),
    (pack_id, 'Node.js Developer',      3),
    (pack_id, 'Python Developer',       4),
    (pack_id, 'API Developer',          5),
    (pack_id, 'Platform Engineer',      6);

  -- Data Engineering Pack
  insert into role_packs (name, description) values (
    'Data Engineering Pack',
    'Data pipelines, warehousing, and analytics engineering'
  ) returning id into pack_id;
  insert into role_pack_roles (pack_id, role, sort_order) values
    (pack_id, 'Data Engineer',          0),
    (pack_id, 'Analytics Engineer',     1),
    (pack_id, 'Data Pipeline Engineer', 2),
    (pack_id, 'ETL Developer',          3),
    (pack_id, 'Data Developer',         4);

  -- DevOps Pack
  insert into role_packs (name, description) values (
    'DevOps Pack',
    'Infrastructure, CI/CD, cloud, and platform reliability'
  ) returning id into pack_id;
  insert into role_pack_roles (pack_id, role, sort_order) values
    (pack_id, 'DevOps Engineer',        0),
    (pack_id, 'Platform Engineer',      1),
    (pack_id, 'Site Reliability Engineer', 2),
    (pack_id, 'Cloud Engineer',         3),
    (pack_id, 'Infrastructure Engineer', 4),
    (pack_id, 'SRE',                    5);

end $$;
