/** The Setup screen and AI Pipeline API (dashboard/server/knowledge.mjs, pipeline.mjs). */
import { onServerEvent } from './events';
import { useEffect, useState } from 'react';
import { viaTunnel } from './api';
import { forThisProject, withProject } from './projects';

export type Browser = 'chromium' | 'firefox' | 'webkit';
export const BROWSERS: { id: Browser; label: string }[] = [
  { id: 'chromium', label: 'Chromium' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'webkit', label: 'WebKit' },
];

export interface Source {
  id: string;
  kind: 'file' | 'link' | 'note';
  type: string;
  name: string;
  size: number | null;
  status: 'parsing' | 'parsed' | 'failed' | 'fetching' | 'fetched' | 'not-readable' | 'saved';
  detail: string | null;
  url?: string;
  text?: string;
  addedAt: string;
}

export interface Role {
  name: string;
  key: string;
  credentials: { username: boolean; password: boolean; hint: string | null };
}

/** null is "Full Coverage (Current Behaviour)", the default. */
export type TestingType = 'ui' | 'functional' | 'security' | null;
export interface TestingTypeOption {
  key: TestingType;
  label: string;
  available: boolean;
}

export interface Project {
  id: string;
  name: string;
  url: string;
  environment: string;
  browsers: Browser[];
  testingType?: TestingType;
  roles: Role[];
  sources: Source[];
  createdAt: string;
  updatedAt: string;
}

export type StageStatus = 'waiting' | 'running' | 'passed' | 'failed' | 'review' | 'stopped' | 'skipped';
export type PipelineStatus = 'idle' | 'running' | 'paused' | 'failed' | 'stopped' | 'completed';

export interface Stage {
  n: number;
  name: string;
  title: string;
  agent: string;
  reviewable: boolean;
  outputs: string[];
  status: StageStatus;
  attempt: number;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
  warning: string | null;
  counts: Record<string, number>;
  files: string[];
  result: { cost: number | null; turns: number; summary: string } | null;
}

export interface Pipeline {
  projectId: string;
  status: PipelineStatus;
  pauseForReview: boolean;
  startedAt: number | null;
  endedAt: number | null;
  current: number | null;
  engine: 'sdk' | 'cli' | null;
  stages: Stage[];
  testingType: TestingType;
  testingTypeLabel: string;
  /** The project's testing type was changed after this run started; Start offers the switch. */
  pendingTestingType?: { key: TestingType; label: string } | null;
  /** Is a Claude account connected on the server's PC? null: it cannot be told, nothing is blocked. */
  claude?: { connected: boolean | null; via?: string };
  /** Security Testing: who confirmed the authorization, when, and for what. */
  authorization?: { by: string; at: string; reference: string | null; scope: string; environment: string } | null;
}

/** The operator's confirmation a Security Testing run needs before it starts. */
export interface SecurityAuthorization {
  confirmed: boolean;
  reference?: string;
}

/** An API error, with the server's code when it gave one (e.g. TESTING_TYPE_CHANGED). */
export class ApiError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
  }
}

export interface LogEntry {
  at: number;
  kind: 'system' | 'text' | 'tool' | 'tool-error' | 'result' | 'error' | 'stderr';
  tool?: string;
  text: string;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${withProject(path)}`, {
    method,
    headers: body === undefined && method === 'GET' ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error ?? `${method} ${path}: HTTP ${res.status}`, data.code ?? null);
  return data;
}

export const setupApi = {
  project: () => call<{ project: Project | null; canControl: boolean; testingTypes?: TestingTypeOption[] }>('GET', 'project'),
  checkUrl: (url: string) => call<{ reachable: boolean; status: number | null; error?: string; ms: number; finalUrl?: string }>('POST', 'project/check-url', { url }),
  save: (body: { id?: string; name: string; url: string; environment: string; browsers: Browser[]; testingType: TestingType; roles: { name: string; username?: string; password?: string }[] }) =>
    call<Project>('POST', 'project', body),
  addFile: (name: string, data: string) => call<Source>('POST', 'project/sources', { kind: 'file', name, data }),
  addLink: (url: string) => call<Source>('POST', 'project/sources', { kind: 'link', url }),
  addNote: (text: string) => call<Source>('POST', 'project/sources', { kind: 'note', text }),
  remove: (id: string) => call<object>('DELETE', `project/sources/${encodeURIComponent(id)}`),
};

/** off: no live browser for this stage; waiting: running, browser not open yet; live: frame available. */
export type LiveFrame = { state: 'off' | 'waiting' | 'live'; at?: number; url?: string; title?: string; frame?: string };

export const pipelineApi = {
  get: () => call<{ pipeline: Pipeline | null; canControl: boolean }>('GET', 'pipeline'),
  /**
   * `switchTestingType`: the user confirmed switching a run to the project's new testing type
   * (stages 3–8 re-run). `securityAuthorization`: required for a Security Testing run's first start.
   */
  start: (pauseForReview: boolean, opts: { switchTestingType?: boolean; securityAuthorization?: SecurityAuthorization } = {}) =>
    call<Pipeline>('POST', 'pipeline/start', { pauseForReview, ...(opts.switchTestingType ? { switchTestingType: true } : {}), ...(opts.securityAuthorization ? { securityAuthorization: opts.securityAuthorization } : {}) }),
  restart: (pauseForReview: boolean) => call<Pipeline>('POST', 'pipeline/restart', { pauseForReview }),
  stop: () => call<object>('POST', 'pipeline/stop'),
  review: (pauseForReview: boolean) => call<Pipeline>('POST', 'pipeline/review', { pauseForReview }),
  stage: (n: number, action: 'retry' | 'skip' | 'approve', fresh = false) => call<Pipeline>('POST', `pipeline/stages/${n}`, { action, fresh }),
  log: (stage: number, attempt: number) => call<LogEntry[]>('GET', `pipeline/log?stage=${stage}&attempt=${attempt}`),
  /** The live preview of a running stage's browser; `since` skips a frame the page already shows. */
  live: (stage: number, since: number) => call<LiveFrame>('GET', `pipeline/live?stage=${stage}&since=${since}`),
  file: async (path: string) => {
    const res = await fetch(withProject(`/api/pipeline/file?path=${encodeURIComponent(path)}`));
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    return res.text();
  },
  fileUrl: (path: string) => withProject(`/api/pipeline/file?path=${encodeURIComponent(path)}`),
  saveFile: (path: string, content: string) => call<object>('POST', 'pipeline/file', { path, content }),
};

/** The pipeline, kept live from the server's event stream. */
export function usePipeline() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [canControl, setCanControl] = useState(false);
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    pipelineApi.get().then((r) => {
      if (!alive) return;
      setPipeline(r.pipeline);
      setCanControl(r.canControl);
      setLoaded(true);
    }).catch(() => alive && setLoaded(true));
    // through a shared tunnel: poll instead of holding an event stream open (see viaTunnel)
    if (viaTunnel()) {
      const t = setInterval(() => pipelineApi.get().then((r) => alive && setPipeline(r.pipeline)).catch(() => {}), 5000);
      return () => {
        alive = false;
        clearInterval(t);
      };
    }
    // the tab's one shared event stream (events.ts)
    const stop = onServerEvent((raw) => {
      const event = raw as unknown as { type: string; projectId?: string; pipeline?: Pipeline; stage?: number; attempt?: number; entry?: LogEntry };
      // after the tab was in the background: re-read the state it may have missed
      if (event.type === 'resync') pipelineApi.get().then((r) => alive && setPipeline(r.pipeline)).catch(() => {});
      // every project's pipeline reports here: keep this project's
      if (event.type === 'pipeline' && event.pipeline && forThisProject(event.pipeline.projectId)) setPipeline(event.pipeline);
      if (event.type === 'pipelineLog' && event.entry && forThisProject(event.projectId)) {
        const key = `${event.stage}:${event.attempt}`;
        setLogs((l) => ({ ...l, [key]: [...(l[key] ?? []), event.entry!].slice(-500) }));
      }
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  // Fallback for proxies that buffer the event stream (a shared tunnel link can): while a stage
  // runs, re-read the state and that stage's log every few seconds. Harmless when events do arrive.
  const runningStage = pipeline?.stages.find((s) => s.status === 'running');
  const runningKey = runningStage ? `${runningStage.n}:${runningStage.attempt}` : null;
  useEffect(() => {
    if (!runningKey) return undefined;
    const [n, attempt] = runningKey.split(':').map(Number);
    const t = setInterval(() => {
      pipelineApi.get().then((r) => r.pipeline && setPipeline(r.pipeline)).catch(() => {});
      pipelineApi.log(n, attempt).then((entries) => setLogs((l) => ((l[runningKey]?.length ?? 0) >= entries.length ? l : { ...l, [runningKey]: entries }))).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [runningKey]);

  /** Load a stage's stored log once (for stages that ran before this page opened). */
  const loadLog = (n: number, attempt: number) => {
    const key = `${n}:${attempt}`;
    if (logs[key] || attempt < 1) return;
    pipelineApi.log(n, attempt).then((entries) => setLogs((l) => (l[key] ? l : { ...l, [key]: entries }))).catch(() => {});
  };

  return { pipeline, canControl, logs, loadLog, loaded };
}

/** Shown until the server answers (and by a server without testing types). */
export const DEFAULT_TESTING_TYPES: TestingTypeOption[] = [{ key: null, label: 'Full Coverage (Current Behaviour)', available: true }];

export function useProject() {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [canControl, setCanControl] = useState(false);
  const [testingTypes, setTestingTypes] = useState<TestingTypeOption[]>(DEFAULT_TESTING_TYPES);
  const reload = () =>
    setupApi.project().then((r) => {
      setProject(r.project);
      setCanControl(r.canControl);
      if (r.testingTypes?.length) setTestingTypes(r.testingTypes);
    }).catch(() => setProject(null));
  useEffect(() => {
    reload();
  }, []);
  return { project, setProject, canControl, reload, testingTypes };
}

export const fmtSize = (n: number | null) =>
  n == null ? '—' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const fmtElapsed = (ms: number | null) => {
  if (ms == null || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
};
