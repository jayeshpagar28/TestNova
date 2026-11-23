import { useEffect, useState } from 'react';
import type { Cause, Status } from '../theme';
import { subscribeRuns, type Regression } from './api';
import { withProject } from './projects';
import type { DashboardData } from './model';
import { dashboard as sample } from './sample';

/** GET /api/dashboard: the same shapes as model.ts, with times as epoch milliseconds. */
interface Wire {
  build: DashboardData['build'];
  device: { id: string | null; online: boolean };
  modules: (Omit<DashboardData['modules'][number], 'lastRun'> & { lastRun: number | null })[];
  trend: { runId: string; module: string; build: string; at: number; counts: Record<Status, number> }[];
  causes: Record<Cause, number>;
  run: (Omit<NonNullable<DashboardData['run']>, 'startedAt' | 'endedAt'> & { startedAt: number; endedAt: number }) | null;
  openDefects: number;
  unsetDefects: number;
  active: { moduleId: string } | null;
  regression: Regression | null;
  canControl: boolean;
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch(withProject('/api/dashboard'));
  if (!res.ok) throw new Error(`dashboard ${res.status}`);
  const w = (await res.json()) as Wire;
  return {
    sample: false,
    build: w.build,
    device: w.device,
    modules: w.modules.map((m) => ({ ...m, lastRun: m.lastRun == null ? null : new Date(m.lastRun) })),
    trend: w.trend.map((p) => ({ ...p, at: new Date(p.at) })),
    causes: w.causes,
    run: w.run && { ...w.run, startedAt: new Date(w.run.startedAt), endedAt: new Date(w.run.endedAt) },
    openDefects: w.openDefects,
    unsetDefects: w.unsetDefects,
    activeModule: w.active?.moduleId ?? null,
    regression: w.regression,
    canControl: w.canControl,
  };
}

/**
 * The dashboard's data: real results from the TestNova server, refreshed whenever an execution
 * starts or finishes. Without a server (the shared single file) it falls back to the sample.
 * `null` while the first answer is on its way.
 */
export function useDashboard(): DashboardData | null {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchDashboard()
        .then((d) => alive && setData(d))
        .catch(() => alive && setData((d) => (d && !d.sample ? d : sample)));
    load();
    // Viewers through a shared tunnel may not receive the event stream (Cloudflare quick tunnels
    // buffer it): refresh on a timer as well, so their page never goes stale.
    const poll = setInterval(load, 15_000);
    let active: string | null = null;
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeRuns(
        (run) => {
          const now = run.status === 'running' ? run.moduleId : null;
          if (now === active) return;
          active = now;
          load();
        },
        // the regression moving on, or stopping, between module executions
        (regression) => {
          if (regression.status !== 'running') return void load();
          setData((d) => (d ? { ...d, regression } : d));
        },
      );
    } catch {
      // no EventSource target (opened from a file): the sample needs no updates
    }
    return () => {
      alive = false;
      clearInterval(poll);
      unsubscribe();
    };
  }, []);

  return data;
}
