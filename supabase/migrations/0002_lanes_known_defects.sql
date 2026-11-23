-- TestNova schema, second step: what the dashboard learned after 0001.
--
-- * Executions run each browser as a parallel lane: their status and reason (for example a
--   browser that cannot launch on the PC) are kept per execution.
-- * Each test result carries the defect its spec is tagged with (@known-defect + BUG-NNN) and
--   the catalogue key, so results join to tests even when two share a TC id.
-- * Comments now name the real layout: one folder per project, projects/<id>/data/runs/<id>/run.json.
--
-- Apply after 0001: Supabase dashboard -> SQL Editor -> paste and run. Re-runnable.

alter table testnova.executions   add column if not exists lanes jsonb not null default '[]';
alter table testnova.test_results add column if not exists known_defect text;
alter table testnova.test_results add column if not exists test_key text;

comment on table  testnova.executions is 'Mirror of projects/<project>/data/runs/<id>/run.json (finished runs). data holds the run without its full log.';
comment on column testnova.executions.lanes is '[{browser, status, reason, passed, failed}] — one parallel lane per browser.';
comment on table  testnova.test_results is 'One row per test and browser. evidence: failure screenshots only, [{name, file, content_type, storage_path}]; storage_path is null once the run is older than the retention period.';
comment on column testnova.test_results.known_defect is 'Defect id the spec tags the test with (BUG-NNN / DEF-NNN), or UNTRACKED.';
comment on table  testnova.pipelines is 'Mirror of projects/<project>/pipeline.json, secrets removed.';
comment on table  testnova.pipeline_logs is 'Lines of projects/<project>/logs/stage-N-attempt-M.jsonl, secrets removed.';
comment on table  testnova.qa_artifacts is 'projects/<project>/qa/** except qa/checkpoints: text inline, pdf/xlsx/images in bucket qa at <project>/<path>.';
