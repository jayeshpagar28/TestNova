import type { Cause, Status } from '../theme';
import type { Regression } from './api';

/**
 * What the main dashboard shows. `live.ts` fills it from the TestNova server; `sample.ts` fills it
 * with generated results when there is no server (the shared single file), marked `sample`.
 * A figure nothing has measured yet is null, and the page says so rather than showing a number.
 */

export interface ModuleSummary {
  id: string;
  order: number;
  name: string;
  icon: string;
  spec: string;
  total: number;
  counts: Record<Status, number>;
  /** passed / executed (passed + failed), as a percentage; null until a test has passed or failed */
  passRate: number | null;
  /** the same figure before the module's latest execution */
  prevPassRate: number | null;
  lastRun: Date | null;
  durationMs: number;
}

export interface TrendPoint {
  runId: string;
  /** the module that execution ran, when each bar is one module's execution */
  module?: string;
  build: string;
  at: Date;
  /** the whole suite's states right after this execution */
  counts: Record<Status, number>;
}

export interface RunSummary {
  runId: string;
  /** what was run: a module name, or "All modules" for a regression */
  module: string;
  scope: 'module' | 'test' | 'regression';
  /** the single test's id when scope is "test" */
  target: string | null;
  build: string | null;
  buildCode: string | null;
  device: string | null;
  startedAt: Date;
  endedAt: Date;
  counts: Record<Status, number>;
  /** the previous execution of the same thing; null when this is the first */
  prevCounts: Record<Status, number> | null;
  defects: number;
  /** for a regression: modules that executed at least one test, of all modules */
  modulesRun?: number;
  modulesTotal?: number;
}

export interface DashboardData {
  sample: boolean;
  build: { version: string | null; code: string | null };
  device: { id: string | null; online: boolean };
  modules: ModuleSummary[];
  trend: TrendPoint[];
  causes: Record<Cause, number>;
  /** the latest finished execution; null when nothing has run */
  run: RunSummary | null;
  openDefects: number;
  /** defects in the records with no status, so not counted as open */
  unsetDefects: number;
  /** id of the module executing right now */
  activeModule: string | null;
  /** the full regression in progress, if any */
  regression: Regression | null;
  /** runs can be started from this browser (only on the PC hosting TestNova) */
  canControl: boolean;
}
