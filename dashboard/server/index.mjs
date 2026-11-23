#!/usr/bin/env node
/**
 * The TestNova API, on 127.0.0.1:5181. The Vite dev server proxies /api to it.
 *
 * Several projects live side by side (see workspace.mjs). Every request names its project with
 * `?project=<id>`; without one it is the default project (projects/active.json). Nothing a request
 * does reaches another project's files.
 *
 * Reading is open to whoever can reach the dashboard. Anything that changes state only works from
 * this PC: the dashboard also listens on the LAN, and a colleague opening the link must not be
 * able to start a run against the application under test.
 */
import { createReadStream, existsSync, mkdirSync, watch } from 'node:fs';
import { buildCatalogue, readCatalogue } from './catalogue.mjs';
import { createServer } from 'node:http';
import { basename, extname, join } from 'node:path';
import { DEFECT_STATUSES, finished, forgetStore, storeFor } from './store.mjs';
import {
  activeRegression, activeRun, deviceStatus, onRegressionChange, onRunChange, recoverInterrupted, startRegression, startRun, stopRegression, stopRun,
} from './runner.mjs';
import { reportsFor } from './reports.mjs';
import { buildQaReport, forWeb } from './qa-report.mjs';

/** Who made a change, for the defect history: the signed-in member, else this PC. */
const actor = (req) => req.who?.email ?? 'This PC';
import { startSync, syncNow, syncStatus } from './supabase.mjs';
import { OPERATOR_ROUTES, authConfig, identify, sessionCookie, startSession } from './auth.mjs';
import { MAX_UPLOAD, addFile, addLink, addNote, checkUrl, projectView, removeSource, saveProject } from './knowledge.mjs';
import {
  approveStage, followForeignRuns, loadState, onPipeline, pipelineBusy, readStageFile, recoverPipeline, restartPipeline, retryStage, setReview, skipStage, stageLog, startPipeline, stopPipeline,
  view as pipelineView, writeStageFile,
} from './pipeline.mjs';
import { liveFrame } from './live.mjs';
import { PROJECTS, activeProjectId, deleteProject, ensureWorkspace, isProjectId, projectIds, setActiveProject } from './workspace.mjs';
import { testingTypeOptions } from './testing-types.mjs';

const PORT = Number(process.env.TESTNOVA_PORT ?? 5181);
const JSON_TYPE = 'application/json; charset=utf-8';
const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MEDIA = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.zip': 'application/zip',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': JSON_TYPE, '.xml': 'text/plain; charset=utf-8',
};

const clients = new Set();
onRunChange((run) => {
  const { log: _log, ...live } = run;
  const data = `data: ${JSON.stringify({ type: 'run', run: { ...live, tests: run.tests.map(({ steps: _steps, ...t }) => t) } })}\n\n`;
  for (const res of clients) res.write(data);
});
onRegressionChange((regression) => {
  const data = `data: ${JSON.stringify({ type: 'regression', regression })}\n\n`;
  for (const res of clients) res.write(data);
});

onPipeline((event) => {
  const data = `data: ${JSON.stringify(event)}

`;
  for (const res of clients) res.write(data);
});
const broadcast = (event) => {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(data);
};

const API_BASE = `http://127.0.0.1:${PORT}/api`;

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': JSON_TYPE });
  res.end(JSON.stringify(body));
}

function download(res, buffer, type, name) {
  res.writeHead(200, { 'content-type': type, 'content-disposition': `attachment; filename="${name}"`, 'content-length': buffer.length });
  res.end(buffer);
}

async function bodyOf(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    // uploads arrive base64 in JSON: 25 MB of file is ~34 MB of body
    if (size > MAX_UPLOAD * 1.4 + 65536) throw Object.assign(new Error('The request is too large (files up to 25 MB).'), { status: 413 });
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

/** The proxy appends the real client to x-forwarded-for, so the last entry is the one to trust. */
//
// A tunnel (Cloudflare, ngrok…) runs on this PC, so its requests also arrive from 127.0.0.1: without
// more checks, anyone holding a shared link would count as "this PC" and could start runs, change
// the setup or drive the pipeline. So a request is local only if, as well, it names this PC as its
// host and carries none of the headers a tunnel or reverse proxy adds for the real visitor.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const TUNNEL_HEADERS = ['cf-connecting-ip', 'cf-ray', 'x-real-ip', 'forwarded', 'ngrok-trace-id'];
function isLocal(req) {
  const hops = (req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const client = hops.at(-1) ?? req.socket.remoteAddress ?? '';
  const loopback = (ip) => /^(::1|127\.|::ffff:127\.)/.test(ip);
  // every hop must be this PC: a tunnel's visitor shows up earlier in the chain
  if (!loopback(client) || hops.some((h) => !loopback(h))) return false;
  if (TUNNEL_HEADERS.some((h) => req.headers[h] !== undefined)) return false;
  // the browser's own Host (the Vite proxy keeps it, and may copy it to x-forwarded-host): a tunnel
  // or LAN visitor names the tunnel's domain or this PC's network address instead
  const forwardedHost = req.headers['x-forwarded-host'];
  if (forwardedHost !== undefined && !String(forwardedHost).split(',').every((h) => LOCAL_HOST.test(h.trim()))) return false;
  return LOCAL_HOST.test(req.headers.host ?? '');
}

const safeName = (s) => s.replace(/[^\w-]+/g, '_');

/** The project a request is about: `?project=<id>`, else the default project; null when none exist. */
function projectOf(url) {
  const asked = url.searchParams.get('project');
  if (asked) {
    if (!isProjectId(asked)) throw Object.assign(new Error(`Unknown project: ${asked}`), { status: 404 });
    return asked;
  }
  return activeProjectId();
}
const need = (pid) => {
  if (!pid) throw Object.assign(new Error('No project yet. Create one on the Setup screen.'), { status: 409 });
  return pid;
};

/** Every project, with the figures the project list and switcher show. */
function projectList() {
  return projectIds().map((id) => {
    const p = projectView(id);
    const state = loadState(id);
    const cat = readCatalogue(id);
    const runs = storeFor(id).allRuns();
    return {
      id, name: p.name, url: p.url, environment: p.environment, browsers: p.browsers, testingType: p.testingType ?? null, createdAt: p.createdAt, updatedAt: p.updatedAt,
      pipeline: { status: pipelineBusy(id) ? 'running' : (state?.status ?? 'idle'), current: state?.current ?? null, passed: state?.stages.filter((x) => x.status === 'passed').length ?? 0 },
      modules: cat.modules.length, tests: cat.modules.reduce((n, m) => n + m.tests.length, 0),
      executions: runs.filter(finished).length, lastRun: runs[0]?.endedAt ?? runs[0]?.startedAt ?? null,
      running: Boolean(activeRun(id) || activeRegression(id)),
    };
  });
}

const EMPTY_DASHBOARD = {
  sample: false, build: { version: null, code: null }, total: 0, executions: 0, modules: [], trend: [],
  causes: { app: 0, script: 0, env: 0, data: 0, known: 0, triage: 0 }, run: null, openDefects: 0, unsetDefects: 0,
};

async function mutate(req, res, [head, id, sub], url) {
  // A JSON content type also forces a CORS preflight, which this server never approves, so
  // another website open in this PC's browser cannot post here either.
  if (!req.headers['content-type']?.includes('application/json')) {
    return reply(res, 403, { error: 'Runs, setup, pipeline and defect changes can only be made on the PC hosting TestNova.' });
  }
  const who = req.who;
  if (!who.local) {
    if (!OPERATOR_ROUTES.has(head)) return reply(res, 403, { error: 'Setup changes (projects, test logins, knowledge sources) can only be made on the PC hosting TestNova.' });
    if (who.role !== 'operator') return reply(res, 403, { error: `${who.email} can view TestNova but not start or change anything (viewer). Ask the TestNova owner for the operator role.` });
    console.log(`remote change by ${who.email}: ${req.method} ${url.pathname}`);
  }
  const body = await bodyOf(req);
  const pid = projectOf(url);
  // ── Supabase mirror ──
  if (head === 'supabase' && id === 'sync') return reply(res, 200, await syncNow());
  // ── projects ──
  if (head === 'projects' && id === 'select') {
    setActiveProject(body.id);
    return reply(res, 200, { active: body.id });
  }
  if (head === 'projects' && id === 'delete') {
    const target = String(body.id ?? '');
    if (!isProjectId(target)) return reply(res, 404, { error: 'Unknown project' });
    const { name } = projectView(target);
    // the exact name, typed by the user: a slip of the mouse cannot delete a project
    if (String(body.confirm ?? '').trim() !== name) return reply(res, 400, { error: `Type the project name exactly (${name}) to delete it.` });
    if (pipelineBusy(target)) return reply(res, 409, { error: `${name}'s pipeline is running. Stop it first.` });
    if (activeRun(target) || activeRegression(target)) return reply(res, 409, { error: `${name} has an execution running. Stop it first.` });
    const result = deleteProject(target);
    forgetStore(target);
    broadcast({ type: 'projects' });
    syncNow(); // a full pass removes the deleted project from Supabase too
    return reply(res, 200, result);
  }
  // ── project setup ── (POST /project without an id creates a new, independent project)
  if (head === 'project' && !id) {
    if (body.id && body.id !== pid) return reply(res, 409, { error: 'The project in the form is not the selected project. Reload the page.' });
    // a running pipeline keeps the testing type it started with: changing it mid-run would leave
    // Setup and the run disagreeing about what is being tested
    if (body.id && 'testingType' in body && pipelineBusy(body.id) && (body.testingType || null) !== (projectView(body.id)?.testingType ?? null)) {
      return reply(res, 409, { error: 'The AI Pipeline is running for this project. Stop it, or wait for it to finish, before changing the testing type.' });
    }
    const saved = await saveProject(body);
    broadcast({ type: 'projects' });
    return reply(res, 200, saved);
  }
  if (head === 'project' && id === 'check-url') return reply(res, 200, await checkUrl(body.url));
  if (head === 'project' && id === 'sources' && !sub) {
    if (!pid) return reply(res, 409, { error: 'Save the project first.' });
    if (body.kind === 'file') return reply(res, 201, await addFile(pid, body));
    if (body.kind === 'link') return reply(res, 201, await addLink(pid, body));
    if (body.kind === 'note') return reply(res, 201, addNote(pid, body));
    return reply(res, 400, { error: 'kind must be file, link or note' });
  }
  if (head === 'project' && id === 'sources' && sub && req.method === 'DELETE') {
    removeSource(need(pid), sub);
    return reply(res, 200, {});
  }
  // ── AI pipeline ──
  if (head === 'pipeline') {
    const p = need(pid);
    // `actor`: who started it, for a Security run's authorization record (never taken from the body)
    if (id === 'start') return reply(res, 202, startPipeline(p, { ...body, actor: actor(req) }, API_BASE));
    if (id === 'restart') return reply(res, 202, restartPipeline(p, { ...body, actor: actor(req) }, API_BASE));
    if (id === 'stop') {
      stopPipeline(p);
      return reply(res, 202, {});
    }
    if (id === 'review') return reply(res, 200, setReview(p, body.pauseForReview));
    if (id === 'file') return reply(res, 200, writeStageFile(p, body.path, String(body.content ?? '')));
    if (id === 'stages' && sub) {
      const n = Number(sub);
      if (body.action === 'retry') return reply(res, 202, retryStage(p, n, API_BASE, { fresh: body.fresh === true }));
      if (body.action === 'skip') return reply(res, 200, skipStage(p, n));
      if (body.action === 'approve') return reply(res, 202, approveStage(p, n, API_BASE));
    }
    return reply(res, 404, { error: 'Not found' });
  }
  const store = storeFor(need(pid));
  // `rerun`: "failed" or a list of test keys; the runner re-runs those (plus any test whose code
  // changed) and carries every other result from the module's last full execution
  if (head === 'runs' && !id) return reply(res, 201, store.summary(startRun(pid, body.moduleId, body.testKey, null, { rerun: body.rerun })));
  if (head === 'regressions' && !id) return reply(res, 201, await startRegression(pid));
  if (head === 'regressions' && sub === 'stop') {
    stopRegression(pid, id);
    return reply(res, 202, {});
  }
  if (head === 'runs' && sub === 'stop') {
    stopRun(pid, id);
    return reply(res, 202, {});
  }
  if (head === 'defects' && !id) {
    if (!body.moduleId || !body.title?.trim()) return reply(res, 400, { error: 'A defect needs a module and a title.' });
    return reply(res, 201, store.createDefect(body));
  }
  if (head === 'defects' && sub === 'status') {
    if (!DEFECT_STATUSES.includes(body.status)) return reply(res, 400, { error: `Status must be one of ${DEFECT_STATUSES.join(', ')}.` });
    await store.refreshDefects();
    store.setDefectStatus(id, body.status, actor(req), String(body.note ?? '').slice(0, 500));
    return reply(res, 200, {});
  }
  // assignee, comments, resolution and classification, as people enter them (kept with history)
  if (head === 'defects' && sub === 'fields') {
    await store.refreshDefects();
    if (store.defectBook().get(id).missing) return reply(res, 404, { error: 'Unknown defect' });
    return reply(res, 200, { changed: store.setDefectFields(id, body.fields ?? {}, actor(req)) });
  }
  if (head === 'links') {
    if (!body.moduleId || !body.testId || !body.defectId) return reply(res, 400, { error: 'moduleId, testId and defectId are required.' });
    store.linkDefect(body.moduleId, body.testId, body.defectId);
    return reply(res, 200, {});
  }
  return reply(res, 404, { error: 'Not found' });
}

async function report(res, pid, id, format) {
  const store = storeFor(need(pid));
  const { consolidatedExcel, consolidatedPdf, defectSheet, hasExecutions, runExcel, runPdf } = reportsFor(pid);
  const project = safeName(projectView(pid)?.name ?? pid);
  await store.refreshDefects();
  // the defect sheet needs no execution: it is every defect the project has recorded
  if (id === 'defects') return download(res, await defectSheet(), XLSX, `TestNova_${project}_Defect_Sheet.xlsx`);
  if (id === 'consolidated') {
    if (!hasExecutions()) return reply(res, 409, { error: 'No module of this project has been executed yet.' });
    return format === 'xlsx'
      ? download(res, await consolidatedExcel(), XLSX, `TestNova_${project}_Consolidated_Report.xlsx`)
      : download(res, await consolidatedPdf(), PDF, `TestNova_${project}_Consolidated_Report.pdf`);
  }
  const run = store.getRun(id);
  if (!run) return reply(res, 404, { error: 'Unknown execution' });
  if (!finished(run)) return reply(res, 409, { error: 'This execution has not finished.' });
  const name = `TestNova_${project}_${safeName(run.moduleName)}_${run.id}`;
  if (format === 'xlsx') return download(res, await runExcel(run), XLSX, `${name}.xlsx`);
  if (format === 'detailed') return download(res, await runPdf(run, true), PDF, `${name}_Detailed.pdf`);
  return download(res, await runPdf(run, false), PDF, `${name}.pdf`);
}

/** Sign-in endpoints: open to everyone (they are how a visitor becomes a member). */
async function authRoute(req, res, id, local) {
  if (req.method === 'GET' && id === 'config') return reply(res, 200, { ...authConfig(), local });
  if (req.method === 'GET' && id === 'me') {
    const who = await identify(req, local);
    return reply(res, 200, { local, email: who.email, role: who.role, signedIn: local || Boolean(who.role), required: !local });
  }
  if (req.method === 'POST' && req.headers['content-type']?.includes('application/json')) {
    if (id === 'session') {
      const body = await bodyOf(req);
      const r = await startSession(String(body.accessToken ?? ''));
      if (!r.ok) {
        res.setHeader('set-cookie', sessionCookie(req, null));
        return reply(res, r.status, { error: r.error });
      }
      res.setHeader('set-cookie', sessionCookie(req, String(body.accessToken)));
      console.log(`signed in: ${r.email} (${r.role})`);
      return reply(res, 200, { email: r.email, role: r.role });
    }
    if (id === 'signout') {
      res.setHeader('set-cookie', sessionCookie(req, null));
      return reply(res, 200, { ok: true });
    }
  }
  return reply(res, 404, { error: 'Not found' });
}

async function route(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);
  const [head, id, sub] = parts;
  const local = isLocal(req);
  if (head === 'auth') return authRoute(req, res, id, local);
  req.who = await identify(req, local);
  if (!local && !req.who.email) return reply(res, 401, { error: 'Sign in to use TestNova from another computer.', signIn: true });
  if (!local && !req.who.role) return reply(res, 403, { error: `${req.who.email} is not on the TestNova team.`, signIn: true });
  req.canOperate = req.who.role === 'operator';
  if (req.method !== 'GET') return mutate(req, res, parts, url);

  if (head === 'events') {
    // no-transform: a tunnel or CDN must not compress (and so buffer) the stream; x-accel-buffering
    // asks reverse proxies not to hold it back. The heartbeat keeps an idle viewer's connection
    // open through proxies that drop silent connections (Cloudflare closes them after ~100 s).
    res.writeHead(200, {
      'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no',
    });
    res.write(': connected\n\n');
    clients.add(res);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
    return undefined;
  }
  if (head === 'supabase' && !id) return reply(res, 200, syncStatus());
  if (head === 'projects' && !id) return reply(res, 200, { projects: projectList(), active: activeProjectId(), canControl: isLocal(req) });
  const pid = projectOf(url);
  if (head === 'catalogue') return reply(res, 200, readCatalogue(pid));
  if (head === 'status') {
    return reply(res, 200, {
      projectId: pid, device: await deviceStatus(pid), active: activeRun(pid)?.id ?? null, regression: activeRegression(pid)?.id ?? null,
      hasExecutions: pid ? reportsFor(pid).hasExecutions() : false, canControl: req.canOperate,
    });
  }
  if (head === 'project' && !id) return reply(res, 200, { project: pid ? projectView(pid) : null, canControl: isLocal(req), testingTypes: testingTypeOptions() });
  if (head === 'pipeline' && !id) return reply(res, 200, { pipeline: pid ? pipelineView(loadState(pid)) : null, canControl: req.canOperate });
  if (head === 'pipeline' && id === 'live') return reply(res, 200, pid ? liveFrame(pid, Number(url.searchParams.get('stage')), Number(url.searchParams.get('since') ?? 0)) : { state: 'off' });
  if (head === 'pipeline' && id === 'log') return reply(res, 200, stageLog(pid, Number(url.searchParams.get('stage')), Number(url.searchParams.get('attempt'))));
  if (head === 'pipeline' && id === 'file') {
    const f = readStageFile(need(pid), url.searchParams.get('path'));
    const ext = extname(f.path).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webm', '.zip', '.pdf', '.xlsx'].includes(ext)) {
      res.writeHead(200, { 'content-type': { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webm': 'video/webm', '.zip': 'application/zip', '.pdf': PDF, '.xlsx': XLSX }[ext] });
      return createReadStream(f.abs).pipe(res);
    }
    if (f.size > 2 * 1024 * 1024) return reply(res, 413, { error: 'Too large to show here; open it from the folder.' });
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return createReadStream(f.abs).pipe(res);
  }
  if (head === 'dashboard') {
    if (!pid) return reply(res, 200, { ...EMPTY_DASHBOARD, projectId: null, device: await deviceStatus(null), active: null, regression: null, canControl: req.canOperate });
    const store = storeFor(pid);
    await store.refreshDefects();
    return reply(res, 200, { ...store.dashboardView(), projectId: pid, device: await deviceStatus(pid), active: activeRun(pid), regression: activeRegression(pid), canControl: req.canOperate });
  }
  const store = storeFor(need(pid));
  if (head === 'modules' && id) {
    await store.refreshDefects();
    const view = store.moduleView(id, activeRun(pid));
    return view ? reply(res, 200, view) : reply(res, 404, { error: 'Unknown module' });
  }
  if (head === 'runs' && id) {
    const run = store.getRun(id);
    return run ? reply(res, 200, run) : reply(res, 404, { error: 'Unknown execution' });
  }
  if (head === 'runs') return reply(res, 200, store.allRuns().map((r) => store.summary(r)));
  if (head === 'regressions' && id) {
    await store.refreshDefects();
    // "latest": the one running now, else the newest
    const rid = id === 'latest' ? (activeRegression(pid)?.id ?? store.allRegressions()[0]?.id) : id;
    if (!rid) return reply(res, 200, null); // nothing run yet: not an error
    const view = store.regressionView(rid, activeRun(pid));
    return view ? reply(res, 200, view) : reply(res, 404, { error: 'Unknown regression' });
  }
  if (head === 'regressions') return reply(res, 200, store.allRegressions());
  if (head === 'defects') {
    await store.refreshDefects();
    return reply(res, 200, store.defectBook().all());
  }
  if (head === 'evidence' && id && sub) {
    const file = join(store.runDir(id), 'evidence', basename(sub));
    if (!store.getRun(id) || !existsSync(file)) return reply(res, 404, { error: 'No such evidence' });
    res.writeHead(200, { 'content-type': MEDIA[extname(file)] ?? 'application/octet-stream' });
    return createReadStream(file).pipe(res);
  }
  if (head === 'reports' && id) return report(res, pid, id, url.searchParams.get('format'));
  // the QA report as data: the dashboard's report page reads the same model as the PDF and Excel
  if (head === 'qa-report') {
    if (!reportsFor(pid).hasExecutions()) return reply(res, 200, null);
    return reply(res, 200, forWeb(await buildQaReport(pid, { runId: url.searchParams.get('run') || null })));
  }
  return reply(res, 404, { error: 'Not found' });
}

for (const pid of projectIds()) ensureWorkspace(pid);
recoverInterrupted();
recoverPipeline();
followForeignRuns();
for (const pid of projectIds()) await storeFor(pid).refreshDefects();

// Each project's catalogue follows its sources: specs, test plans and the knowledge base. A change
// rebuilds that project's catalogue (debounced: the generator writes many files at once) and tells
// the pages, which fetch it again.
const pendingBuilds = new Map();
const rebuildCatalogue = (pid) => {
  clearTimeout(pendingBuilds.get(pid));
  pendingBuilds.set(pid, setTimeout(() => {
    pendingBuilds.delete(pid);
    buildCatalogue(pid)
      .then((c) => {
        console.log(`catalogue ${pid}: ${c.modules.length} modules, ${c.modules.reduce((n, m) => n + m.tests.length, 0)} tests (${c.source})`);
        broadcast({ type: 'catalogue', projectId: pid });
      })
      .catch((e) => console.warn(`catalogue ${pid} not rebuilt: ${e.message}`));
  }, 1500));
};
const SOURCES = /^(tests\/e2e|qa\/03-test-plan|qa\/00-knowledge-base)(\/|$)/;
mkdirSync(PROJECTS, { recursive: true });
{
  watch(PROJECTS, { recursive: true }, (_event, file) => {
    if (!file) return;
    const [pid, ...rest] = String(file).split(/[\\/]/);
    if (rest.length && SOURCES.test(rest.join('/')) && isProjectId(pid)) rebuildCatalogue(pid);
  });
}
for (const pid of projectIds()) rebuildCatalogue(pid);
createServer((req, res) => {
  route(req, res, new URL(req.url, 'http://localhost')).catch((e) => {
    if (res.headersSent) return res.end();
    return reply(res, e.status ?? 500, { error: e.message, ...(e.code && typeof e.code === 'string' && /^[A-Z_]+$/.test(e.code) ? { code: e.code, detail: e.detail ?? null } : {}) });
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`TestNova API on http://127.0.0.1:${PORT}`);
  startSync();
});
