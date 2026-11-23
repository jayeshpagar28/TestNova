/**
 * Which project this page shows. TestNova holds several projects side by side; the server scopes
 * every request with `?project=<id>`. The choice is kept per browser (localStorage), so two people
 * can look at different projects at the same time. Changing it remounts the app, so every page
 * loads that project's data from scratch and nothing of the previous project lingers.
 */
import { useCallback, useEffect, useState } from 'react';
import type { PipelineStatus } from './setup';

const KEY = 'testnova:project';
const EVENT = 'testnova:project-change';

let current: string | null = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();

export const currentProjectId = () => current;

export function setCurrentProjectId(id: string | null) {
  if (id === current) return;
  current = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the choice lasts for this page only
  }
  window.dispatchEvent(new Event(EVENT));
}

/** `path` with this page's project added, for API calls and links (downloads, evidence). */
export function withProject(path: string) {
  if (!current) return path;
  return `${path}${path.includes('?') ? '&' : '?'}project=${encodeURIComponent(current)}`;
}

/** Does a live event belong to the project on screen? Events without a project are global. */
export const forThisProject = (projectId: string | null | undefined) => !projectId || !current || projectId === current;

export function useCurrentProjectId() {
  const [id, setId] = useState(current);
  useEffect(() => {
    const change = () => setId(current);
    window.addEventListener(EVENT, change);
    return () => window.removeEventListener(EVENT, change);
  }, []);
  return id;
}

export interface ProjectSummary {
  id: string;
  name: string;
  url: string;
  environment: string;
  browsers: string[];
  createdAt: string;
  updatedAt: string;
  pipeline: { status: PipelineStatus; current: number | null; passed: number };
  modules: number;
  tests: number;
  executions: number;
  lastRun: number | null;
  running: boolean;
}

interface ProjectsAnswer {
  projects: ProjectSummary[];
  active: string | null;
  canControl: boolean;
}

export async function fetchProjects(): Promise<ProjectsAnswer> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error(`projects ${res.status}`);
  return (await res.json()) as ProjectsAnswer;
}

/**
 * Make sure the page shows a project that exists: the one kept in this browser, else the server's
 * default (the last one created or picked). Resolves once settled; `null` when there is none yet.
 */
export async function settleProject(): Promise<string | null> {
  try {
    const { projects, active } = await fetchProjects();
    const ok = (id: string | null) => Boolean(id && projects.some((p) => p.id === id));
    const id = ok(current) ? current : ok(active) ? active : (projects.at(-1)?.id ?? null);
    setCurrentProjectId(id);
    return id;
  } catch {
    return current; // the server is down: keep the last choice
  }
}

/** Switch the page to another project, and make it the default for new pages on this PC. */
export function selectProject(id: string, canControl: boolean) {
  setCurrentProjectId(id);
  if (canControl) {
    fetch('/api/projects/select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
  }
}

/** Every project, refreshed every 15 s and whenever the server reports a change. */
export function useProjects() {
  const [data, setData] = useState<ProjectsAnswer | null>(null);
  const reload = useCallback(() => {
    fetchProjects().then(setData).catch(() => {});
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 15_000);
    window.addEventListener('testnova:projects-changed', reload);
    return () => {
      clearInterval(t);
      window.removeEventListener('testnova:projects-changed', reload);
    };
  }, [reload]);
  return { projects: data?.projects ?? null, active: data?.active ?? null, canControl: data?.canControl ?? false, reload };
}

export const projectsChanged = () => window.dispatchEvent(new Event('testnova:projects-changed'));

/**
 * Delete a project. The server moves its folder to .testnova/deleted-projects/ (so it can be
 * restored by hand) and refuses while its pipeline or an execution is running. `confirm` must be
 * the project's exact name.
 */
export async function deleteProject(id: string, confirm: string): Promise<{ deleted: string; movedTo: string; active: string | null }> {
  const res = await fetch('/api/projects/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, confirm }) });
  const body = (await res.json().catch(() => ({}))) as { error?: string; deleted: string; movedTo: string; active: string | null };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
