/**
 * Supabase mirror. Local files stay the source of truth: this module copies them up, and nothing
 * in TestNova ever reads its own state back from Supabase.
 *
 * It is a reconciler, not an event log: each pass scans every project on disk, compares each
 * record's checksum with what it last uploaded (.testnova/supabase-sync.json), and sends only
 * what changed. So a pass after an outage, a restart or a first install (the backfill) is the
 * same code as a pass after one run. Passes run a few seconds after a run or pipeline event and
 * every few minutes as a safety net (which also keeps a free-tier project from pausing).
 *
 * What goes up (schema: supabase/migrations):
 *   projects            project.json (role names only)
 *   knowledge_sources   knowledge/sources.json, upload files in bucket "knowledge"
 *   qa_artifacts        qa/** text inline, pdf/xlsx/images in bucket "qa"
 *   pipelines           pipeline.json
 *   pipeline_logs       logs/stage-N-attempt-M.jsonl, new lines only
 *   executions          data/runs/<id>/run.json (finished runs)
 *   test_results        one row per test and browser; failure screenshots in bucket "evidence"
 *   regressions         data/regressions/*.json
 *   defects             the project's defect book (stage 7 log + dashboard changes)
 *
 * Never: any .env, test-login credential, video or trace. Every text passes through redact(),
 * which removes each secret value of every .env. Screenshots are kept in Storage only for runs
 * younger than SUPABASE_EVIDENCE_RETENTION_DAYS (default 14); older runs keep their results.
 * A project deleted locally is deleted from Supabase (rows and files).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, sep } from 'node:path';
import { secretValues } from './knowledge.mjs';
import { onPipeline } from './pipeline.mjs';
import { onRunChange } from './runner.mjs';
import { storeFor } from './store.mjs';
import { ROOT, projectIds, workspaceDir } from './workspace.mjs';

const require = createRequire(import.meta.url);
const STATE_FILE = process.env.TESTNOVA_SUPABASE_STATE ?? join(ROOT, '.testnova', 'supabase-sync.json');
const FULL_PASS_MS = 5 * 60_000;
const BUCKETS = ['evidence', 'knowledge', 'qa'];
const TEXT = new Set(['.md', '.json', '.csv', '.txt', '.html', '.xml', '.yml', '.yaml']);
const BINARY = { '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const IMAGE = /\.(png|jpe?g)$/i;
const MAX_OBJECT = 45 * 1024 * 1024; // free tier: 50 MB per object

// ── configuration (the root .env; the server does not load it into process.env) ──
function rootEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').trim();
  }
  return out;
}
const config = () => {
  const env = { ...rootEnv(), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('SUPABASE_'))) };
  return {
    url: env.SUPABASE_URL ?? '',
    secret: env.SUPABASE_SECRET_KEY ?? '',
    retentionDays: Number(env.SUPABASE_EVIDENCE_RETENTION_DAYS) > 0 ? Number(env.SUPABASE_EVIDENCE_RETENTION_DAYS) : 14,
    disabled: env.TESTNOVA_SUPABASE === 'off',
  };
};

let client = null;
/** Tests only: a stand-in for the Supabase client. */
export const _useClient = (c) => {
  client = c;
};
function db() {
  const c = config();
  if (!client) {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(c.url, c.secret, { db: { schema: 'testnova' }, auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

// ── sync state ──────────────────────────────────────────────────────────────
const loadState = () => {
  try {
    return { done: {}, logs: {}, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) };
  } catch {
    return { done: {}, logs: {} };
  }
};
let state = loadState();
const saveState = () => {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
};

const status = { state: 'idle', lastSyncAt: state.lastSyncAt ?? null, lastError: null, lastErrorAt: null, offlineSince: null, uploaded: 0, pending: 0 };
export function syncStatus() {
  const c = config();
  if (c.disabled || !c.url || !c.secret) return { enabled: false, state: 'disabled', reason: c.disabled ? 'TESTNOVA_SUPABASE=off' : 'SUPABASE_URL or SUPABASE_SECRET_KEY is not set in .env' };
  return { enabled: true, ...status, pending: dirty.size, retentionDays: c.retentionDays };
}

// ── helpers ─────────────────────────────────────────────────────────────────
const sha = (data) => createHash('sha256').update(data).digest('hex');
const ansi = (s) => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '');
let secrets = [];
const redact = (s) => {
  let out = String(s ?? '');
  for (const v of secrets) if (out.includes(v)) out = out.split(v).join('••••');
  return out;
};
/** A JSON value with every secret removed from every string in it. */
const clean = (value) => {
  const text = JSON.stringify(value ?? null);
  const red = redact(text);
  if (red === text) return value;
  try {
    return JSON.parse(red);
  } catch {
    return JSON.parse(redact(JSON.stringify(value, (_k, v) => (typeof v === 'string' ? redact(v) : v))));
  }
};
const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
const OFFLINE = /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i;
class Offline extends Error {}

/** Throw on a Supabase error; network failures become Offline, which ends the pass quietly. */
function check(result, what) {
  const e = result?.error;
  if (!e) return result?.data;
  const msg = `${what}: ${e.message ?? e}`;
  if (OFFLINE.test(String(e.message ?? e)) || e.status === 0 || e.statusCode === '0') throw new Offline(msg);
  throw new Error(msg);
}
async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) check(await db().from(table).upsert(rows.slice(i, i + 500), { onConflict }), `upsert ${table}`);
}
async function upload(bucket, path, file, contentType) {
  const body = readFileSync(file);
  check(await db().storage.from(bucket).upload(path, body, { contentType, upsert: true }), `upload ${bucket}/${path}`);
  status.uploaded += 1;
}
/** Every object under a prefix (Storage lists one folder level at a time). */
async function listAll(bucket, prefix) {
  const out = [];
  const walk = async (p) => {
    for (let offset = 0; ; offset += 1000) {
      const items = check(await db().storage.from(bucket).list(p, { limit: 1000, offset }), `list ${bucket}/${p}`) ?? [];
      for (const it of items) {
        const full = p ? `${p}/${it.name}` : it.name;
        if (it.id === null) await walk(full); // a folder
        else out.push(full);
      }
      if (items.length < 1000) break;
    }
  };
  await walk(prefix);
  return out;
}
async function removeObjects(bucket, paths) {
  for (let i = 0; i < paths.length; i += 500) check(await db().storage.from(bucket).remove(paths.slice(i, i + 500)), `remove ${bucket}`);
}
/** Run `fn` only when `key`'s checksum changed since the last successful upload. */
async function once(key, hash, fn) {
  if (state.done[key] === hash) return false;
  await fn();
  state.done[key] = hash;
  return true;
}
const forget = (prefix) => {
  for (const k of Object.keys(state.done)) if (k.startsWith(prefix)) delete state.done[k];
  for (const k of Object.keys(state.logs)) if (k.startsWith(prefix)) delete state.logs[k];
};
const filesUnder = (base) => {
  const out = [];
  if (!existsSync(base)) return out;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!e.name.startsWith('.')) out.push(p);
    }
  };
  walk(base);
  return out;
};
const rel = (W, p) => relative(W, p).split(sep).join('/');
/** "EX-20261106-111733" → its start time, for evidence retention. */
const runTime = (run) => run.startedAt ?? Date.parse(String(run.id).replace(/^EX-(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d).*/, '$1-$2-$3T$4:$5:$6'));

// ── one project ─────────────────────────────────────────────────────────────
async function syncProject(pid) {
  const W = workspaceDir(pid);
  const project = readJson(join(W, 'project.json'), null);
  if (!project) return;
  const P = `${pid}:`;

  // project
  const { id: _id, name, url, environment, browsers, roles, ...rest } = project;
  const row = clean({ id: pid, name, url, environment: environment ?? '', browsers: browsers ?? ['chromium'], roles: (roles ?? []).map((r) => ({ name: r.name, key: r.key })), config: rest, updated_at: new Date().toISOString() });
  await once(`${P}project`, sha(JSON.stringify({ ...row, updated_at: 0 })), () => upsert('projects', [row], 'id'));

  // knowledge sources (+ uploaded files)
  const sources = readJson(join(W, 'knowledge', 'sources.json'), []);
  for (const s of sources) {
    const file = s.kind === 'file' && s.file ? join(W, s.file) : null;
    const stat = file && existsSync(file) ? statSync(file) : null;
    const storagePath = stat && stat.size <= MAX_OBJECT ? `${pid}/${s.file.split('/').pop()}` : null;
    await once(`${P}source:${s.id}`, sha(JSON.stringify({ s, size: stat?.size, mtime: stat?.mtimeMs })), async () => {
      if (storagePath) await upload('knowledge', storagePath, file, BINARY[extname(file).toLowerCase()] ?? 'application/octet-stream');
      const { id, kind, name: sname, size, status: st, ...meta } = s;
      await upsert('knowledge_sources', [clean({ id, project_id: pid, kind, name: sname ?? s.url ?? 'note', size_bytes: size ?? null, status: st ?? 'added', storage_path: storagePath, meta, updated_at: new Date().toISOString() })], 'id');
    });
  }
  const sourceIds = new Set(sources.map((s) => s.id));
  for (const k of Object.keys(state.done).filter((k) => k.startsWith(`${P}source:`))) {
    const id = k.slice(`${P}source:`.length);
    if (sourceIds.has(id)) continue;
    check(await db().from('knowledge_sources').delete().eq('id', id), 'delete knowledge source');
    delete state.done[k];
  }
  const keepKnowledge = new Set(sources.filter((s) => s.kind === 'file' && s.file).map((s) => `${pid}/${s.file.split('/').pop()}`));
  if (state.done[`${P}source-gc`] !== [...keepKnowledge].sort().join('|')) {
    const stale = (await listAll('knowledge', pid)).filter((p) => !keepKnowledge.has(p));
    if (stale.length) await removeObjects('knowledge', stale);
    state.done[`${P}source-gc`] = [...keepKnowledge].sort().join('|');
  }

  // qa/ outputs (checkpoints are the agents' scratch state, not outputs)
  const qaFiles = filesUnder(join(W, 'qa')).filter((f) => !rel(W, f).startsWith('qa/checkpoints/'));
  const qaPaths = new Set();
  for (const f of qaFiles) {
    const path = rel(W, f);
    const ext = extname(f).toLowerCase();
    if (!TEXT.has(ext) && !BINARY[ext]) continue;
    const stat = statSync(f);
    if (stat.size > MAX_OBJECT) continue;
    qaPaths.add(path);
    const data = readFileSync(f);
    const hash = sha(data);
    await once(`${P}qa:${path}`, hash, async () => {
      const stage = Number(path.match(/^qa\/0?(\d)/)?.[1]);
      const text = TEXT.has(ext);
      const storagePath = text ? null : `${pid}/${path}`;
      if (storagePath) await upload('qa', storagePath, f, BINARY[ext]);
      await upsert('qa_artifacts', [{ project_id: pid, path, stage: Number.isFinite(stage) ? stage + 1 : null, content_type: text ? `text/${ext.slice(1)}` : BINARY[ext], content: text ? redact(data.toString('utf8')) : null, storage_path: storagePath, sha256: hash, updated_at: iso(stat.mtimeMs) }], 'project_id,path');
    });
  }
  for (const k of Object.keys(state.done).filter((k) => k.startsWith(`${P}qa:`))) {
    const path = k.slice(`${P}qa:`.length);
    if (qaPaths.has(path)) continue;
    check(await db().from('qa_artifacts').delete().eq('project_id', pid).eq('path', path), 'delete qa artifact');
    await removeObjects('qa', [`${pid}/${path}`]);
    delete state.done[k];
  }

  // pipeline state
  const pipeFile = join(W, 'pipeline.json');
  if (existsSync(pipeFile)) {
    const text = readFileSync(pipeFile, 'utf8');
    await once(`${P}pipeline`, sha(text), async () => {
      const pipe = clean(readJson(pipeFile, {}));
      await upsert('pipelines', [{ project_id: pid, state: pipe, status: pipe.status ?? 'idle', updated_at: new Date().toISOString() }], 'project_id');
    });
  }

  // pipeline logs: append-only, so only the new lines go up
  for (const f of filesUnder(join(W, 'logs')).filter((f) => /stage-\d+-attempt-\d+\.jsonl$/.test(f))) {
    const [, stage, attempt] = f.match(/stage-(\d+)-attempt-(\d+)\.jsonl$/);
    const key = `${P}${rel(W, f)}`;
    const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean);
    const from = state.logs[key] ?? 0;
    if (lines.length < from) {
      // the file was rewritten (a stage restarted from scratch): replace this attempt's rows
      check(await db().from('pipeline_logs').delete().eq('project_id', pid).eq('stage', Number(stage)).eq('attempt', Number(attempt)), 'reset pipeline log');
      state.logs[key] = 0;
    }
    const rows = lines.slice(state.logs[key] ?? 0).map((l) => {
      let e;
      try {
        e = JSON.parse(l);
      } catch {
        e = { text: l };
      }
      return { project_id: pid, stage: Number(stage), attempt: Number(attempt), at: iso(e.at) ?? new Date().toISOString(), kind: String(e.kind ?? 'text').slice(0, 20), message: redact(`${e.tool ? `${e.tool}: ` : ''}${ansi(e.text ?? '')}`).slice(0, 20_000) };
    });
    if (rows.length) {
      for (let i = 0; i < rows.length; i += 500) check(await db().from('pipeline_logs').insert(rows.slice(i, i + 500)), 'insert pipeline logs');
      state.logs[key] = lines.length;
      saveState();
    }
  }

  // executions, their per-browser results and failure screenshots
  const c = config();
  const cutoff = Date.now() - c.retentionDays * 86_400_000;
  const store = storeFor(pid);
  const runs = store.allRuns().filter((r) => r.status !== 'running');
  const runIds = new Set(runs.map((r) => r.id));
  for (const run of runs) {
    const file = join(store.runDir(run.id), 'run.json');
    const fresh = runTime(run) >= cutoff;
    const hash = `${sha(existsSync(file) ? readFileSync(file) : JSON.stringify(run))}:${fresh ? 'evidence' : 'expired'}`;
    await once(`${P}run:${run.id}`, hash, () => syncRun(pid, run, fresh));
  }
  for (const k of Object.keys(state.done).filter((k) => k.startsWith(`${P}run:`))) {
    const id = k.slice(`${P}run:`.length);
    if (runIds.has(id)) continue;
    check(await db().from('executions').delete().eq('id', id), 'delete execution');
    await removeObjects('evidence', await listAll('evidence', `${pid}/${id}`));
    delete state.done[k];
  }

  // regressions
  for (const rg of store.allRegressions()) {
    await once(`${P}regression:${rg.id}`, sha(JSON.stringify(rg)), () => upsert('regressions', [clean({ id: rg.id, project_id: pid, status: rg.status ?? 'unknown', data: rg, updated_at: new Date().toISOString() })], 'id'));
  }

  // defects: the merged book (stage 7's log plus statuses and defects changed on the dashboard)
  let defects = [];
  try {
    await store.refreshDefects?.();
    defects = store.defectBook().all();
  } catch (e) {
    console.warn(`supabase: defects of ${pid} not read: ${e.message}`);
  }
  const defectRows = defects.filter((d) => d?.id).map((d) => clean({ project_id: pid, id: String(d.id), status: String(d.status ?? d.statusLabel ?? 'Open'), priority: d.priority ?? null, severity: d.severity ?? null, module: d.module ?? null, title: String(d.title ?? d.id), data: d, updated_at: new Date().toISOString() }));
  await once(`${P}defects`, sha(JSON.stringify(defectRows.map((r) => ({ ...r, updated_at: 0 })))), async () => {
    await upsert('defects', defectRows, 'project_id,id');
    const ids = defectRows.map((r) => r.id);
    let del = db().from('defects').delete().eq('project_id', pid);
    if (ids.length) del = del.not('id', 'in', `(${ids.map((i) => `"${i.replace(/"/g, '')}"`).join(',')})`);
    check(await del, 'delete removed defects');
  });
}

async function syncRun(pid, run, fresh) {
  const dir = join(storeFor(pid).runDir(run.id), 'evidence');
  const prefix = `${pid}/${run.id}`;
  const shots = new Map(); // local file → storage path
  if (fresh) {
    for (const t of run.tests ?? []) {
      for (const ev of t.evidence ?? []) {
        if (!IMAGE.test(ev.file ?? '') || shots.has(ev.file)) continue;
        const file = join(dir, ev.file);
        if (!existsSync(file)) continue;
        await upload('evidence', `${prefix}/${ev.file}`, file, ev.contentType ?? 'image/png');
        shots.set(ev.file, `${prefix}/${ev.file}`);
      }
    }
  } else {
    const old = await listAll('evidence', prefix);
    if (old.length) await removeObjects('evidence', old);
  }

  const { log, ...data } = run;
  const lanes = (run.lanes ?? []).map((l) => ({ browser: l.browser, status: l.status, reason: l.reason ?? null, passed: l.passed ?? 0, failed: l.failed ?? 0 }));
  await upsert('executions', [clean({
    id: run.id, project_id: pid, module: run.moduleId ?? null, regression_id: run.regressionId ?? null,
    browser: lanes.length ? lanes.map((l) => l.browser).join(',') : null, environment: run.build?.version ?? null,
    status: run.status, started_at: iso(run.startedAt), finished_at: iso(run.endedAt), totals: run.counts ?? {}, lanes,
    data: { ...data, log: (log ?? []).slice(-200) }, updated_at: new Date().toISOString(),
  })], 'id');

  // results: replaced whole, so a re-synced run never keeps a stale row
  check(await db().from('test_results').delete().eq('execution_id', run.id), 'reset test results');
  const seen = new Map();
  const rows = [];
  for (const t of run.tests ?? []) {
    const n = (seen.get(t.id) ?? 0) + 1;
    seen.set(t.id, n);
    const testId = n > 1 ? `${t.id}#${n}` : String(t.id);
    const browsers = Object.entries(t.browsers ?? {});
    for (const [browser, st] of browsers.length ? browsers : [['', t.status]]) {
      const failedHere = st === 'failed' && (!t.failure?.browser || t.failure.browser === browser || !browser);
      rows.push(clean({
        execution_id: run.id, test_id: testId, test_key: t.key ?? null, browser, title: String(t.title ?? t.id), status: st ?? t.status,
        duration_ms: t.durationMs ?? null, known_defect: t.knownDefect ?? null,
        error: failedHere ? ansi(t.failure?.message ?? t.failure?.reason ?? '').slice(0, 4000) || null : null,
        evidence: (t.evidence ?? []).filter((e) => IMAGE.test(e.file ?? '') && (!browser || !e.browser || e.browser === browser))
          .map((e) => ({ name: e.name, file: e.file, content_type: e.contentType ?? 'image/png', storage_path: shots.get(e.file) ?? null })),
      }));
    }
  }
  for (let i = 0; i < rows.length; i += 500) check(await db().from('test_results').insert(rows.slice(i, i + 500)), 'insert test results');
}

/** Projects in Supabase that are gone from this PC: delete their rows (cascade) and files. */
async function removeDeletedProjects(local) {
  const remote = check(await db().from('projects').select('id'), 'list projects') ?? [];
  for (const { id } of remote) {
    if (local.includes(id)) continue;
    for (const b of BUCKETS) await removeObjects(b, await listAll(b, id));
    check(await db().from('projects').delete().eq('id', id), `delete project ${id}`);
    forget(`${id}:`);
    console.log(`supabase: removed deleted project ${id}`);
  }
}

// ── passes ──────────────────────────────────────────────────────────────────
const dirty = new Set();
let running = null;
let again = false;

/** One pass over the given projects (all when none). Never throws; the status says how it went. */
export async function syncNow(only) {
  const c = config();
  if (c.disabled || !c.url || !c.secret) return syncStatus();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    status.state = 'syncing';
    secrets = secretValues();
    const local = projectIds();
    const targets = only?.length ? only.filter((p) => local.includes(p)) : local;
    for (const p of targets) dirty.delete(p);
    try {
      if (!only?.length) await removeDeletedProjects(local);
      for (const pid of targets) {
        try {
          await syncProject(pid);
        } catch (e) {
          if (e instanceof Offline) throw e;
          status.lastError = `${pid}: ${e.message}`;
          status.lastErrorAt = new Date().toISOString();
          dirty.add(pid);
          console.warn(`supabase: ${pid}: ${e.message}`);
        } finally {
          saveState();
        }
      }
      status.offlineSince = null;
      status.lastSyncAt = state.lastSyncAt = new Date().toISOString();
      status.state = dirty.size ? 'error' : 'synced';
      if (!dirty.size) status.lastError = null;
    } catch (e) {
      for (const p of targets) dirty.add(p);
      status.state = 'offline';
      status.offlineSince ??= new Date().toISOString();
      status.lastError = e.message;
      status.lastErrorAt = new Date().toISOString();
    } finally {
      saveState();
      running = null;
    }
    if (again) {
      again = false;
      setTimeout(() => syncNow([...dirty]), 1000);
    }
    return syncStatus();
  })();
  return running;
}

const timers = new Map();
/** Sync one project soon; repeated calls within `ms` collapse into one pass. */
function soon(pid, ms) {
  if (!pid) return;
  dirty.add(pid);
  clearTimeout(timers.get(pid));
  timers.set(pid, setTimeout(() => {
    timers.delete(pid);
    syncNow([pid]);
  }, ms));
}

let started = false;
/** Start mirroring: a first full pass shortly after start-up, then on events and every 5 minutes. */
export function startSync() {
  const c = config();
  if (started || c.disabled || !c.url || !c.secret) return;
  started = true;
  onRunChange((run) => {
    if (run.status !== 'running') soon(run.projectId, 3000);
  });
  onPipeline((event) => soon(event.projectId ?? event.state?.projectId ?? event.pipeline?.projectId, 15_000));
  setTimeout(() => syncNow(), 5000);
  setInterval(() => syncNow(), FULL_PASS_MS).unref();
}
