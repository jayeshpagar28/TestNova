-- TestNova schema for Supabase (free tier).
--
-- Local files are the source of truth; the TestNova server mirrors them here with the
-- service-role key (which bypasses RLS). Signed-in dashboard users only READ, and only if
-- their email is in testnova.members. No table here ever holds a test-login credential.
--
-- Apply: Supabase dashboard -> SQL Editor -> paste and run. Then Project Settings -> Data API ->
-- Exposed schemas: add "testnova". Re-runnable.

create schema if not exists testnova;
grant usage on schema testnova to authenticated, service_role;

-- ── access ────────────────────────────────────────────────────────────────────
-- Who may use the dashboard remotely. viewer: read. operator: read + start/stop/approve
-- (enforced by the TestNova server, which checks this table after verifying the JWT).
create table if not exists testnova.members (
  email       text primary key check (email = lower(email)),
  role        text not null default 'viewer' check (role in ('viewer', 'operator')),
  added_at    timestamptz not null default now()
);

create or replace function testnova.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from testnova.members m where m.email = lower(auth.jwt() ->> 'email'));
$$;

-- ── projects and knowledge ────────────────────────────────────────────────────
create table if not exists testnova.projects (
  id            text primary key,
  name          text not null,
  url           text not null,
  environment   text not null,
  browsers      text[] not null default '{chromium}',
  roles         jsonb not null default '[]',      -- [{name,key}] only, never credentials
  config        jsonb not null default '{}',      -- the rest of project.json
  updated_at    timestamptz not null default now()
);

create table if not exists testnova.knowledge_sources (
  id            text primary key,
  project_id    text not null references testnova.projects(id) on delete cascade,
  kind          text not null check (kind in ('file', 'link', 'note')),
  name          text not null,
  size_bytes    bigint,
  status        text not null,                    -- parsed | failed | not-readable | fetched ...
  storage_path  text,                             -- object in bucket 'knowledge'
  meta          jsonb not null default '{}',
  updated_at    timestamptz not null default now()
);

-- qa/ stage outputs (knowledge base, plans, exploratory results, reports) as text + object.
create table if not exists testnova.qa_artifacts (
  project_id    text not null references testnova.projects(id) on delete cascade,
  path          text not null,                    -- e.g. qa/03-test-plan/login-test-plan.md
  stage         int,
  content_type  text not null,
  content       text,                             -- text formats inline (md/json/csv)
  storage_path  text,                             -- binaries (pdf/xlsx/png) in bucket 'qa'
  sha256        text not null,
  updated_at    timestamptz not null default now(),
  primary key (project_id, path)
);

-- ── pipeline ──────────────────────────────────────────────────────────────────
create table if not exists testnova.pipelines (
  project_id    text primary key references testnova.projects(id) on delete cascade,
  state         jsonb not null,                   -- mirror of projects/<id>/pipeline.json
  status        text not null,
  updated_at    timestamptz not null default now()
);

create table if not exists testnova.pipeline_logs (
  id            bigint generated always as identity primary key,
  project_id    text not null references testnova.projects(id) on delete cascade,
  stage         int not null,
  attempt       int not null default 1,
  at            timestamptz not null default now(),
  kind          text not null,                    -- text | tool | result | error
  message       text not null                     -- secrets redacted before insert
);
create index if not exists pipeline_logs_stage on testnova.pipeline_logs (project_id, stage, attempt, id);

-- ── executions ────────────────────────────────────────────────────────────────
create table if not exists testnova.executions (
  id            text primary key,                 -- same id as dashboard/data/runs/<id>
  project_id    text not null references testnova.projects(id) on delete cascade,
  module        text,
  regression_id text,
  browser       text,
  environment   text,
  status        text not null,
  started_at    timestamptz,
  finished_at   timestamptz,
  totals        jsonb not null default '{}',
  data          jsonb not null,                   -- the full execution.json
  updated_at    timestamptz not null default now()
);
create index if not exists executions_project on testnova.executions (project_id, started_at desc);

create table if not exists testnova.test_results (
  execution_id  text not null references testnova.executions(id) on delete cascade,
  test_id       text not null,                    -- TC-…
  browser       text not null default '',
  title         text not null,
  status        text not null,
  duration_ms   int,
  error         text,
  evidence      jsonb not null default '[]',      -- [{name, storage_path, content_type}]
  primary key (execution_id, test_id, browser)
);

create table if not exists testnova.regressions (
  id            text primary key,
  project_id    text not null references testnova.projects(id) on delete cascade,
  status        text not null,
  data          jsonb not null,
  updated_at    timestamptz not null default now()
);

create table if not exists testnova.defects (
  project_id    text not null references testnova.projects(id) on delete cascade,
  id            text not null,                    -- DEF-001
  status        text not null,
  priority      text,
  severity      text,
  module        text,
  title         text not null,
  data          jsonb not null,
  updated_at    timestamptz not null default now(),
  primary key (project_id, id)
);

-- ── row level security: members read, nobody but the service role writes ─────
do $$
declare t text;
begin
  foreach t in array array['projects','knowledge_sources','qa_artifacts','pipelines','pipeline_logs',
                           'executions','test_results','regressions','defects','members']
  loop
    execute format('alter table testnova.%I enable row level security', t);
    execute format('drop policy if exists member_read on testnova.%I', t);
    execute format('create policy member_read on testnova.%I for select to authenticated using (testnova.is_member())', t);
    execute format('grant select on testnova.%I to authenticated', t);
    execute format('grant all on testnova.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema testnova to service_role;

-- ── storage buckets (private; members read through signed URLs) ───────────────
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false), ('knowledge', 'knowledge', false), ('qa', 'qa', false)
on conflict (id) do nothing;

drop policy if exists testnova_member_read on storage.objects;
create policy testnova_member_read on storage.objects for select to authenticated
  using (bucket_id in ('evidence', 'knowledge', 'qa') and testnova.is_member());
