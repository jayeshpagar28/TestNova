/**
 * The QA report, as the server builds it (dashboard/server/qa-report.mjs). The dashboard's report
 * page, the PDF and the Excel workbook all read this one model, so their figures agree; the
 * fingerprint shows it.
 */
import { withProject } from './projects';

export type Tone = 'green' | 'red' | 'orange' | 'grey' | 'blue';
export const DEFECT_STATUSES = ['Open', 'In Progress', 'Resolved', 'Retest', 'Closed', 'Reopened'] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export interface Evidence { kind: 'image' | 'video' | 'file'; figure: number | null; caption: string; file: string }
export interface Classification { value: string; recorded: string | null; standard: boolean; provisional: boolean; pending: boolean }
export interface HistoryEntry { at: string; from?: string | null; to?: string; fields?: string[]; by: string; note?: string }

export interface ReportModule {
  id: string; name: string; executionId: string | null; executedAt: number | null; durationMs: number | null;
  total: number; passed: number; failed: number; skipped: number; notExecuted: number; passPct: number | null; failPct: number | null;
  defectIds: string[]; status: { label: string; tone: Tone }; explanation: string;
}

export interface RegisterDefect {
  id: string; aliases: string[]; dateReported: string; store: string; instance: string; moduleId: string; module: string;
  title: string; description: string; testData: string; steps: string; expected: string; actual: string;
  status: string; statusKnown: boolean; open: boolean; priority: Classification; severity: Classification; classifiedBy: string | null; type: string;
  developer: string; resolvedDate: string; devComment: string; qaComment: string; changes: string;
  tests: string[]; failingTests: string[]; failingNow: boolean; evidence: Evidence[]; history: HistoryEntry[]; flags: string[];
}

export interface Failure {
  key: string; id: string; moduleId: string; module: string; title: string; scenario: string; testData: string;
  expected: string; actual: string; simple: string; impact: string; impactBasis: string | null; technical: string | null;
  defectIds: string[]; defectNote: string | null; defectLinks: { id: string; basis: string; title: string; label: string }[];
  unresolvedTags: string[]; executionId: string; retried: boolean; evidence: Evidence[]; trace: string | null; analysis: string[];
}

export interface QaReport {
  meta: {
    reportId: string; scope: string; fingerprint: string; generatedAt: number; executionStart: number | null; executionEnd: number | null;
    project: { id: string; name: string; url: string; environment: string }; build: string; device: string; suite: string; executionIds: string[];
    browsers: { name: string; version: string | null; versionNote: string | null }[]; definitions: { passPct: string; defects: string };
  };
  overall: { label: string; tone: Tone };
  summary: string;
  totals: {
    modules: number; modulesExecuted: number; total: number; passed: number; failed: number; skipped: number; notExecuted: number;
    passPct: number | null; failPct: number | null; uniqueDefects: number; defectsLinkedToFailures: number; openDefects: number; resolvedDefects: number; failedLinked: number; failedUnlinked: number;
  };
  modules: ReportModule[];
  failures: Failure[];
  register: RegisterDefect[];
  accessibility: { available: boolean; scans: number; basis: string; testCases: number; themes: { key: string; label: string; available: boolean; tests: number | null; passed: number | null; failed: number | null; notTested: number | null; defects: string[] }[] };
  comparison: {
    available: boolean; note: string; defects: { new: string[]; resolved: string[]; reopened: string[]; persistent: string[] };
    modules: { id: string; name: string; previous: string | null; current: string; previousPassPct?: number | null; passPct?: number | null; change?: number | null; improved?: string[]; regressed?: string[]; sameCoverage?: boolean; note: string | null }[];
  };
  observations: {
    majorIssues: { id: string; title: string; module: string; priority: string; severity: string; status: string }[];
    modulesNeedingAttention: { id: string; name: string; reason: string }[];
    outstanding: { open: number; byPriority: [string, number][]; byStatus: [string, number][] };
    accessibility: string[]; additionalTesting: string[];
  };
  recommendation: { verdict: string; tone: Tone; text: string; reasons: string[] };
  validation: { level: 'error' | 'warning' | 'info'; check: string; message: string; source: string }[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${withProject(path)}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? 'The TestNova server is not responding. Start it with npm run dashboard.');
  return body as T;
}
const post = <T,>(path: string, body: unknown) => call<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const reportApi = {
  /** null: nothing executed yet */
  report: () => call<QaReport | null>('qa-report'),
  setStatus: (id: string, status: DefectStatus, note = '') => post(`defects/${id}/status`, { status, note }),
  setFields: (id: string, fields: Record<string, string>) => post<{ changed: string[] }>(`defects/${id}/fields`, { fields }),
};

export const downloadUrl = (kind: 'pdf' | 'xlsx' | 'defects') =>
  withProject(kind === 'defects' ? '/api/reports/defects' : `/api/reports/consolidated?format=${kind}`);

/** An evidence file of the report ("data/runs/<execution>/evidence/<file>") as a URL the server serves. */
export function evidenceSrc(file: string): string | null {
  const m = file.match(/runs\/(EX-[\w-]+)\/evidence\/([^/]+)$/);
  return m ? withProject(`/api/evidence/${m[1]}/${encodeURIComponent(m[2])}`) : null;
}
