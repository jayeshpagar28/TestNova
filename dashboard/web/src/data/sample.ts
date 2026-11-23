/**
 * What the dashboard shows when the TestNova server cannot be reached. The catalogue (modules and
 * tests) is real; there are NO results: nothing has been measured, so every figure is a dash and
 * every test is Not executed. The reference project generated sample results here; TestNova never
 * shows a made-up number. `sample` is true so the page can say the server is offline.
 */
import { offlineCatalogue as catalogue } from './catalogue';
import type { Cause, Status } from '../theme';
import type { DashboardData } from './model';

const zero = (): Record<Status, number> => ({ passed: 0, failed: 0, notrun: 0, blocked: 0 });

export const dashboard: DashboardData = {
  sample: true,
  build: { version: null, code: null },
  device: { id: null, online: false },
  modules: catalogue.modules.map((m) => ({
    id: m.id,
    order: m.order,
    name: m.name,
    icon: m.icon,
    spec: m.spec ?? "",
    total: m.tests.length,
    counts: { ...zero(), notrun: m.tests.length },
    passRate: null,
    prevPassRate: null,
    lastRun: null,
    durationMs: 0,
  })),
  trend: [],
  causes: { app: 0, script: 0, env: 0, data: 0, known: 0, triage: 0 } as Record<Cause, number>,
  openDefects: 0,
  unsetDefects: 0,
  activeModule: null,
  regression: null,
  canControl: false,
  run: null,
};
