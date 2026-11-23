/** The TestNova API (dashboard/server). Everything on a module page comes from here, for the project on screen. */
import { onServerEvent } from './events';
import { forThisProject, withProject } from './projects';

export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'blocked' | 'notrun';
export type RunStatus = 'running' | 'passed' | 'failed' | 'skipped' | 'stopped' | 'error';
export const DEFECT_STATUSES = ['Open', 'In Progress', 'Resolved', 'Retest', 'Closed', 'Reopened'] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export interface Defect {
  id: string;
  title: string;
  module: string;
  priority: string;
  severity: string;
  source: string;
  trackerStatus: string | null;
  status: DefectStatus | null;
  /** The readable defect format's fields (absent where a page builds a defect from less). */
  statusLabel?: string;
  date?: string | null;
  description?: string;
  testData?: string;
  steps?: string[];
  expected?: string;
  actual?: string;
  evidence?: string[];
  tests?: string[];
  executions?: string[];
}

export interface Failure {
  reason: string;
  message: string;
  stack: string;
  expected: string | null;
  actual: string | null;
}

export interface Evidence {
  name: string;
  file: string;
  contentType: string;
}

export interface RunTest {
  key: string;
  id: string;
  title: string;
  scenario: string;
  description: string;
  priority: string | null;
  expectedResult: string | null;
  knownDefect: string | null;
  status: TestStatus;
  startedAt?: number;
  durationMs?: number;
  retry?: number;
  skipReason?: string | null;
  failure?: Failure | null;
  evidence?: Evidence[];
  steps?: { title: string; durationMs: number; error: string | null }[];
}

export interface Counts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  notrun: number;
  pending: number;
  running: number;
}

interface RunBase {
  id: string;
  /** the project the execution belongs to (executions from before multi-project support have none) */
  projectId?: string;
  moduleId: string;
  moduleName: string;
  scope: 'module' | 'test';
  target: { key: string; id: string; title: string } | null;
  /** set when the execution is one module of a full regression */
  regressionId?: string | null;
  status: RunStatus;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  device: string | null;
  scheduled: number | null;
  currentKey: string | null;
  errors: string[];
  counts: Counts;
  /** One per browser, run in parallel (absent on executions from before browser lanes). */
  lanes?: RunLane[];
}

export interface RunLane {
  browser: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'error' | 'stopped' | 'unavailable';
  /** why the lane could not run (a browser that cannot launch, a process that could not start) */
  reason: string | null;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  notrun: number;
  startedAt: number | null;
  endedAt: number | null;
}

export interface Run extends RunBase {
  tests: RunTest[];
  log?: string[];
}

export interface RunSummary extends RunBase {
  defects: string[];
}

export interface ModuleTest {
  key: string;
  id: string;
  idGenerated: boolean;
  title: string;
  scenario: string;
  description: string;
  group: string;
  modifier: string | null;
  knownDefect: string | null;
  live: boolean;
  priority: string | null;
  expected: string | null;
  steps: string | null;
  /** From the test plan's readable columns (null when the plan has none). */
  planDescription?: string | null;
  testData?: string | null;
  created?: string | null;
  type?: string | null;
  ac?: string | null;
  preconditions?: string | null;
  status: TestStatus;
  runId: string | null;
  lastAt: number | null;
  durationMs: number | null;
  defect: Defect | null;
}

export interface ModuleView {
  module: { id: string; order: number; name: string; icon: string; spec: string; deviceStep: string | null; total: number };
  tests: ModuleTest[];
  runs: RunSummary[];
  defects: Defect[];
  active: Run | null;
}

/** A full regression: every module in run order, one execution each. */
export interface Regression {
  id: string;
  projectId?: string;
  status: RunStatus;
  startedAt: number;
  endedAt: number | null;
  build: { version: string | null; code: string | null };
  device: string | null;
  /** position of the module now running; equals modules.length once finished */
  index: number;
  stopped: boolean;
  /** why it ended early, when it did not end by itself or by Stop */
  note: string | null;
  modules: { moduleId: string; name: string; runId: string | null; status: RunStatus | 'pending' | 'notrun'; error?: string }[];
}

/** One test on the regression page. */
export interface RegressionTest {
  key: string;
  id: string;
  title: string;
  scenario: string;
  priority: string | null;
  knownDefect: string | null;
  status: TestStatus;
  startedAt: number | null;
  durationMs: number | null;
  skipReason: string | null;
  failure: Pick<Failure, 'reason' | 'message' | 'expected' | 'actual'> | null;
  /** the defect a failed test is linked to (a dashboard link, else the spec's @known-defect) */
  defect: Pick<Defect, 'id' | 'title' | 'status' | 'source'> | null;
}

export interface RegressionModule {
  moduleId: string;
  name: string;
  icon: string | null;
  runId: string | null;
  status: Regression['modules'][number]['status'];
  error?: string;
  startedAt: number | null;
  endedAt: number | null;
  currentKey: string | null;
  errors: string[];
  tests: RegressionTest[];
}

export interface RegressionView extends Omit<Regression, 'modules'> {
  modules: RegressionModule[];
  total: number;
}

export interface ServerStatus {
  device: { online: boolean; id: string | null; detail: string };
  active: string | null;
  regression: string | null;
  hasExecutions: boolean;
  canControl: boolean;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${withProject(path)}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? 'The TestNova server is not responding. Start it with npm run dashboard.');
  return body as T;
}

const post = <T,>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  status: () => call<ServerStatus>('status'),
  module: (id: string) => call<ModuleView>(`modules/${id}`),
  run: (id: string) => call<Run>(`runs/${id}`),
  defects: () => call<Defect[]>('defects'),
  start: (moduleId: string, testKey?: string) => post<RunSummary>('runs', { moduleId, testKey }),
  stop: (id: string) => post(`runs/${id}/stop`, {}),
  startRegression: () => post<Regression>('regressions', {}),
  regressions: () => call<Regression[]>('regressions'),
  /** `latest`: the regression running now, else the newest one */
  regression: (id: string) => call<RegressionView | null>(`regressions/${id}`),
  stopRegression: (id: string) => post(`regressions/${id}/stop`, {}),
  createDefect: (body: { moduleId: string; testId: string; title: string; description: string; priority: string; severity: string; runId: string }) =>
    post<Defect>('defects', body),
  link: (moduleId: string, testId: string, defectId: string) => post('links', { moduleId, testId, defectId }),
  setDefectStatus: (id: string, status: DefectStatus) => post(`defects/${id}/status`, { status }),
};

export const evidenceUrl = (runId: string, file: string) => withProject(`/api/evidence/${runId}/${encodeURIComponent(file)}`);
export const reportUrl = (runId: string, format: 'pdf' | 'xlsx' | 'detailed') => withProject(`/api/reports/${runId}?format=${format}`);

/**
 * Opened through a shared tunnel link? Then the page must not hold event-stream connections open:
 * Cloudflare quick tunnels buffer them (nothing arrives) and localtunnel has only a few relay
 * connections, which open streams exhaust until every request times out. Such pages poll instead.
 */
export const viaTunnel = () => /\.(loca\.lt|trycloudflare\.com|ngrok-free\.app|ngrok\.io)$/i.test(location.hostname);

/** Polling stand-in for the event stream: reports the active run and regression every few seconds. */
function pollRuns(onRun: (run: Run) => void, onRegression?: (regression: Regression) => void) {
  let last: { run: string | null; regression: string | null } = { run: null, regression: null };
  let stopped = false;
  const tick = async () => {
    try {
      const s = await api.status();
      // the active run, and once more when it has just finished, so its final state is seen
      for (const id of new Set([s.active, last.run].filter(Boolean) as string[])) onRun(await api.run(id));
      if (onRegression) {
        for (const id of new Set([s.regression, last.regression].filter(Boolean) as string[])) {
          const rg = (await api.regressions()).find((r) => r.id === id);
          if (rg) onRegression(rg);
        }
      }
      last = { run: s.active, regression: s.regression };
    } catch {
      // the server or the tunnel is briefly unreachable: try again on the next tick
    }
    if (!stopped) timer = setTimeout(tick, 4000);
  };
  let timer = setTimeout(tick, 1000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Live updates from the server: executions, and full regressions. */
export function subscribeRuns(onRun: (run: Run) => void, onRegression?: (regression: Regression) => void) {
  if (viaTunnel()) return pollRuns(onRun, onRegression);
  // the tab's one shared event stream (events.ts)
  return onServerEvent((raw) => {
    const event = raw as unknown as { type: 'run'; run: Run } | { type: 'regression'; regression: Regression };
    // the server reports every project's executions: keep this project's
    if (event.type === 'run' && forThisProject(event.run.projectId)) onRun(event.run);
    if (event.type === 'regression' && forThisProject(event.regression.projectId)) onRegression?.(event.regression);
  });
}
