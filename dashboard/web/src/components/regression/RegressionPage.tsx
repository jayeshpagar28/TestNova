import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Bug, Menu, Play, Radio, Square } from 'lucide-react';
import {
  api, subscribeRuns, type Regression, type RegressionModule, type RegressionTest, type RegressionView, type Run, type TestStatus,
} from '../../data/api';
import type { DashboardData } from '../../data/model';
import { EASE_OUT } from '../../theme';
import { clock, dateTimeMs, timeOfDay } from '../../lib/format';
import { goDashboard, goModule, goRegression } from '../../lib/router';
import { Card, CardTitle, Chips } from '../Card';
import { ModuleIcon } from '../ModuleIcon';
import { RegressionFlow } from '../RegressionFlow';
import { ThemeToggle } from '../ThemeToggle';
import { RunBadge, StatusBadge, TEST_STATUS } from '../module/StatusBadge';
import { TestDetail } from '../module/TestDetail';
import { ProjectName } from '../ProjectName';

type Filter = 'all' | TestStatus;
const FILTERS: Filter[] = ['all', 'running', 'passed', 'failed', 'skipped', 'blocked', 'pending', 'notrun'];
const DONE = new Set<TestStatus>(['passed', 'failed', 'skipped', 'blocked']);

function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/** A live execution's rows, in the regression page's shape. The defect stays as the server gave it. */
function liveTests(run: Run, before: RegressionTest[]): RegressionTest[] {
  return run.tests.map((t) => {
    const prev = before.find((b) => b.key === t.key);
    const failed = t.status === 'failed';
    return {
      key: t.key, id: t.id, title: t.title, scenario: t.scenario || t.title, priority: t.priority, knownDefect: t.knownDefect,
      status: t.status, startedAt: t.startedAt ?? null, durationMs: t.durationMs ?? null, skipReason: t.skipReason ?? null,
      failure: failed && t.failure ? t.failure : null,
      defect: failed ? (prev?.defect ?? (t.knownDefect ? { id: t.knownDefect, title: '', status: null, source: '' } : null)) : null,
    };
  });
}

function Tally({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
        <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-light tabular-nums text-ink">{value}</div>
    </div>
  );
}

export function RegressionPage({
  id, dashboard, onMenu, onRegression, blocked,
}: {
  /** null: the regression running now, else the newest */
  id: string | null;
  dashboard: DashboardData | null;
  onMenu: () => void;
  onRegression: () => void;
  blocked: string | null;
}) {
  const [view, setView] = useState<RegressionView | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Regression[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [open, setOpen] = useState<{ moduleId: string; test: RegressionTest; runId: string | null } | null>(null);
  const shown = useRef<string | null>(null);

  const load = useCallback(() => {
    api.regression(id ?? 'latest').then((v) => {
      shown.current = v?.id ?? null;
      setView(v);
      setError(v ? '' : 'No regression has been run yet. Run Regression runs every module in the browser.');
    }).catch((e: Error) => {
      setView(null);
      setError(e.message);
    });
    api.regressions().then(setHistory).catch(() => setHistory([]));
  }, [id]);

  useEffect(load, [load]);

  // Live: the running module's tests come straight from its execution; anything else reloads.
  useEffect(
    () =>
      subscribeRuns(
        (run) => {
          if (!run.regressionId || run.regressionId !== shown.current) return;
          if (run.status !== 'running') return load();
          setView((v) => {
            if (!v) return v;
            const modules = v.modules.map((m) =>
              m.moduleId === run.moduleId ? { ...m, runId: run.id, status: 'running' as const, startedAt: run.startedAt, currentKey: run.currentKey, tests: liveTests(run, m.tests) } : m,
            );
            return { ...v, modules, total: modules.reduce((n, m) => n + m.tests.length, 0) };
          });
        },
        (rg) => {
          // a regression moving on, ending, or (when following the latest) a new one starting
          if (rg.id === shown.current || (!id && rg.status === 'running')) load();
        },
      ),
    [id, load],
  );

  const running = view?.status === 'running';
  const now = useNow(running);
  const all = useMemo(() => view?.modules.flatMap((m) => m.tests.map((t) => ({ m, t }))) ?? [], [view]);
  const tally = useMemo(() => {
    const n: Record<Filter, number> = { all: all.length, running: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, pending: 0, notrun: 0 };
    for (const { t } of all) n[t.status] += 1;
    return n;
  }, [all]);
  const done = all.filter(({ t }) => DONE.has(t.status)).length;
  const current = view?.modules.find((m) => m.status === 'running') ?? null;
  const currentTest = current?.tests.find((t) => t.key === current.currentKey) ?? null;
  const failures = all.filter(({ t }) => t.status === 'failed');
  const withDefect = failures.filter(({ t }) => t.defect);

  // Keep the running test in view inside the list, without moving the page.
  const list = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const box = list.current;
    const r = row.current;
    if (box && r && running) box.scrollTo({ top: r.offsetTop - box.clientHeight / 2, behavior: 'smooth' });
  }, [currentTest?.key, running]);

  const header = (
    <div className="flex items-center gap-3">
      <button onClick={onMenu} aria-label="Open navigation" className="grid size-9 place-items-center rounded-full border border-line text-ink-2 lg:hidden"><Menu size={16} /></button>
      <button onClick={goDashboard} className="flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Dashboard</button>
      <div className="ml-auto"><ThemeToggle /></div>
    </div>
  );
  const runButton = (
    <motion.button
      whileHover={blocked ? undefined : { scale: 1.03 }}
      whileTap={blocked ? undefined : { scale: 0.97 }}
      disabled={Boolean(blocked)}
      title={blocked ?? undefined}
      onClick={onRegression}
      className={`flex h-10 items-center gap-2 rounded-full px-5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        dashboard?.regression ? 'border border-line-2 bg-white/[0.06] text-ink' : 'bg-white text-[#111] shadow-[0_0_24px_rgb(255_255_255/0.15)]'
      }`}
    >
      {dashboard?.regression ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
      {dashboard?.regression ? 'Stop regression' : 'Run Regression'}
    </motion.button>
  );

  if (!view) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Card className="mt-6 flex flex-col items-center gap-4 p-10 text-center" label="Regression execution">
          <h1 className="text-[28px] font-light text-ink">Regression Execution</h1>
          <p className="max-w-[460px] text-[13px] text-ink-2">{error || 'Loading…'}</p>
          {error && !id && runButton}
        </Card>
      </div>
    );
  }

  const flowModules = dashboard?.modules ?? [];
  const index = Math.min(view.index, view.modules.length - 1);
  const outcomes = view.modules.map((m) => m.status);
  const visible = view.modules
    .filter((m) => moduleFilter === 'all' || m.moduleId === moduleFilter)
    .map((m) => ({ m, tests: filter === 'all' ? m.tests : m.tests.filter((t) => t.status === filter) }))
    .filter(({ tests }) => tests.length);
  const ended = view.endedAt ?? now;

  return (
    <div className="flex flex-col gap-5">
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }} className="flex flex-col gap-4">
        {header}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-light leading-tight tracking-[-0.01em] text-ink sm:text-[36px]">Regression Execution<ProjectName /></h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
              <RunBadge status={view.status} />
              <span className="tabular-nums">{view.id}</span>
              <span>Started <span className="text-ink">{dateTimeMs(view.startedAt)}</span></span>
              <span>{running ? 'Elapsed' : 'Duration'} <span className="tabular-nums text-ink">{clock(ended - view.startedAt)}</span></span>
              {view.build.version && <span>Build <span className="text-ink">{view.build.version}</span>{view.build.code && ` (${view.build.code})`}</span>}
              {view.device && <span>Browser <span className="text-ink">{view.device}</span></span>}
            </div>
            {view.note && <p className="mt-2 text-[12.5px] text-warn">{view.note}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {history.length > 1 && (
              <select
                aria-label="Show a previous regression"
                value={view.id}
                onChange={(e) => goRegression(e.target.value)}
                className="h-10 rounded-full border border-line bg-card px-3 text-[12.5px] text-ink outline-none"
              >
                {history.map((r) => (
                  <option key={r.id} value={r.id}>
                    {dateTimeMs(r.startedAt)} · {r.status === 'running' ? 'running' : r.status}
                  </option>
                ))}
              </select>
            )}
            {runButton}
          </div>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-12">
        <div className="min-w-0 2xl:col-span-7">
          <RegressionFlow
            modules={flowModules}
            build={view.build}
            total={view.total}
            runningIndex={running ? index : null}
            outcomes={outcomes}
            delay={0.1}
          />
        </div>

        <Card glow className="p-5 2xl:col-span-5" delay={0.15} label="Regression progress">
          <div className="flex items-center gap-2 text-[13px] text-ink">
            {running ? <Radio size={14} className="live-dot text-electric" aria-hidden /> : null}
            {running ? 'Live progress' : 'Result'}
          </div>
          <div className="mt-3" role="progressbar" aria-label="Regression progress" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={done}>
            <div className="flex justify-between text-[12px] text-ink-2">
              <span>{done} of {view.total} test cases executed</span>
              <span className="tabular-nums text-ink">{view.total ? Math.round((done / view.total) * 100) : 0}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-lilac to-electric" animate={{ width: `${view.total ? (done / view.total) * 100 : 0}%` }} transition={{ duration: 0.5, ease: EASE_OUT }} />
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-3">Module {Math.min(view.index + 1, view.modules.length)} of {view.modules.length}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tally label="Total" value={view.total} color="var(--color-ink-2)" />
            <Tally label="Passed" value={tally.passed} color="var(--color-passed)" />
            <Tally label="Failed" value={tally.failed} color="var(--color-failed)" />
            <Tally label="Skipped" value={tally.skipped} color="var(--color-ink-2)" />
            <Tally label="Blocked" value={tally.blocked} color="var(--color-blocked)" />
            <Tally label="Running" value={tally.running} color="var(--color-electric)" />
            <Tally label="Pending" value={tally.pending} color="var(--color-ink-3)" />
            <Tally label="Not run" value={tally.notrun} color="var(--color-notrun)" />
          </div>

          <div className="mt-4 rounded-2xl border border-electric/40 bg-electric/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-ink-2">Now executing</p>
            <AnimatePresence mode="wait">
              <motion.div key={currentTest?.key ?? current?.moduleId ?? 'idle'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                {current ? (
                  <>
                    <p className="mt-1 flex items-center gap-2 text-[13.5px] text-ink">
                      <ModuleIcon name={current.icon ?? 'boxes'} size={14} /> {current.name}
                      {current.startedAt && <span className="text-[11.5px] text-ink-3">module {clock(now - current.startedAt)}</span>}
                    </p>
                    <p className="mt-1 text-[12.5px] text-ink-2">
                      {currentTest ? (
                        <>
                          <span className="tabular-nums text-ink">{currentTest.id}</span> {currentTest.scenario}
                          {currentTest.startedAt && <span className="ml-2 tabular-nums text-ink-3">{clock(now - currentTest.startedAt)}</span>}
                        </>
                      ) : (
                        'Starting the browser or the next test…'
                      )}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] text-ink-2">{running ? 'Moving to the next module…' : 'Nothing is executing.'}</p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-12">
        <Card className="flex min-w-0 flex-col p-5 2xl:col-span-8" delay={0.2} label="Regression test cases">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-medium tracking-wide text-ink">Test cases <span className="ml-1 text-ink-3">{view.total}</span></h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter by module"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="h-9 rounded-full border border-line bg-card px-3 text-[12px] text-ink outline-none"
              >
                <option value="all">All modules</option>
                {view.modules.map((m) => (
                  <option key={m.moduleId} value={m.moduleId}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="no-scrollbar mt-3 max-w-full overflow-x-auto">
            <Chips<Filter>
              label="Filter regression test cases"
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((f) => ({ value: f, label: `${f === 'all' ? 'All' : TEST_STATUS[f].label} ${tally[f]}` }))}
            />
          </div>

          <div ref={list} className="relative mt-4 max-h-[720px] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-left text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-card text-[11px] uppercase tracking-[0.06em] text-ink-3">
                <tr>
                  <th className="w-[96px] border-b border-line py-2 pr-3 font-normal">Test case ID</th>
                  <th className="border-b border-line py-2 pr-3 font-normal">Test case</th>
                  <th className="w-[104px] border-b border-line py-2 pr-3 font-normal">Status</th>
                  <th className="hidden w-[28%] border-b border-line py-2 pr-3 font-normal lg:table-cell">Failure reason</th>
                  <th className="w-[96px] border-b border-line py-2 font-normal">Defect</th>
                </tr>
              </thead>
              {visible.map(({ m, tests }) => (
                <ModuleRows key={m.moduleId} m={m} tests={tests} currentRef={row} onOpen={(t) => setOpen({ moduleId: m.moduleId, test: t, runId: m.runId })} />
              ))}
            </table>
            {!visible.length && <p className="py-10 text-center text-[13px] text-ink-3">No test cases have this status.</p>}
          </div>
        </Card>

        <Card className="flex min-w-0 flex-col p-5 2xl:col-span-4" delay={0.25} label="Defects identified">
          <CardTitle right={<Bug size={15} className="text-ink-3" aria-hidden />}>Defects identified</CardTitle>
          <p className="mt-1 text-[12px] text-ink-2">
            {failures.length} failed · {withDefect.length} with a defect · {failures.length - withDefect.length} need triage
          </p>
          <ul className="mt-3 flex max-h-[720px] flex-col gap-2 overflow-y-auto">
            {failures.map(({ m, t }) => (
              <li key={`${m.moduleId}|${t.key}`}>
                <button onClick={() => setOpen({ moduleId: m.moduleId, test: t, runId: m.runId })} className="w-full rounded-2xl border border-line p-3 text-left transition hover:border-line-2 hover:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="tabular-nums text-ink">{t.id} <span className="text-ink-3">· {m.name}</span></span>
                    {t.defect ? (
                      <span className="shrink-0 rounded-md border border-failed/40 bg-failed/10 px-1.5 py-px tabular-nums text-ink">{t.defect.id}</span>
                    ) : (
                      <span className="shrink-0 text-[11px] text-warn">Needs triage</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[12.5px] text-ink-2">{t.scenario}</p>
                  {t.failure?.reason && <p className="mt-1 line-clamp-2 text-[12px] text-ink" title={t.failure.message}>{t.failure.reason}</p>}
                  {t.defect && (
                    <p className="mt-1 truncate text-[11.5px] text-ink-3" title={t.defect.title}>
                      {t.defect.status ?? 'Status not set'}{t.defect.title && ` · ${t.defect.title}`}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!failures.length && <p className="py-8 text-center text-[12.5px] text-ink-3">{running ? 'No failures so far.' : 'No test failed.'}</p>}
        </Card>
      </div>

      <AnimatePresence>
        {open && (
          <TestDetail
            moduleId={open.moduleId}
            row={{
              key: open.test.key, id: open.test.id, title: open.test.title, scenario: open.test.scenario, description: '',
              priority: open.test.priority, expectedResult: null, knownDefect: open.test.knownDefect, status: open.test.status,
            }}
            runId={open.runId}
            canControl={dashboard?.canControl ?? false}
            defect={open.test.defect && { ...open.test.defect, module: '', priority: '', severity: '', trackerStatus: null }}
            onClose={() => setOpen(null)}
            onChanged={load}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ModuleRows({
  m, tests, currentRef, onOpen,
}: {
  m: RegressionModule;
  tests: RegressionTest[];
  currentRef: React.RefObject<HTMLTableRowElement | null>;
  onOpen: (t: RegressionTest) => void;
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={5} className="border-b border-line bg-white/[0.02] px-2 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ModuleIcon name={m.icon ?? 'boxes'} size={13} className="text-ink-2" />
            <button onClick={() => goModule(m.moduleId)} className="text-[12.5px] font-medium text-ink hover:underline">{m.name}</button>
            {m.status === 'pending' || m.status === 'notrun' ? (
              <span className="text-[11.5px] text-ink-3">{m.status === 'pending' ? 'Waiting' : 'Not run'}</span>
            ) : (
              <RunBadge status={m.status} />
            )}
            {m.startedAt && <span className="text-[11.5px] tabular-nums text-ink-3">{timeOfDay(m.startedAt)}{m.endedAt && ` · ${clock(m.endedAt - m.startedAt)}`}</span>}
            {m.error && <span className="text-[11.5px] text-bad">{m.error}</span>}
            {m.status === 'error' && m.errors[0] && <span className="truncate text-[11.5px] text-bad" title={m.errors.join('\n')}>{m.errors[0].split('\n')[0]}</span>}
          </div>
        </td>
      </tr>
      {tests.map((t) => {
        const live = t.key === m.currentKey && t.status === 'running';
        return (
          <tr
            key={t.key}
            ref={live ? currentRef : undefined}
            onClick={() => onOpen(t)}
            aria-current={live ? 'true' : undefined}
            className={`cursor-pointer transition-colors ${live ? 'bg-electric/15 shadow-[inset_2px_0_0_var(--color-electric)]' : 'hover:bg-white/[0.03]'}`}
          >
            <td className="whitespace-nowrap border-b border-line py-2.5 pl-2 pr-3 align-top tabular-nums text-ink-2">{t.id}</td>
            <td className="border-b border-line py-2.5 pr-3 align-top text-ink">
              {t.scenario}
              {t.skipReason && (t.status === 'skipped' || t.status === 'blocked') && <span className="mt-0.5 block text-[11.5px] text-ink-3">{t.skipReason}</span>}
              {t.failure?.reason && <span className="mt-0.5 block text-[11.5px] text-bad lg:hidden">{t.failure.reason}</span>}
            </td>
            <td className="border-b border-line py-2.5 pr-3 align-top">
              <StatusBadge status={t.status} />
              {t.durationMs != null && t.status !== 'running' && <span className="block text-[11px] tabular-nums text-ink-3">{clock(t.durationMs)}</span>}
            </td>
            <td className="hidden border-b border-line py-2.5 pr-3 align-top text-[12px] text-ink lg:table-cell">
              {t.failure ? <span className="line-clamp-3" title={t.failure.message}>{t.failure.reason || t.failure.message}</span> : <span className="text-ink-3">—</span>}
            </td>
            <td className="border-b border-line py-2.5 align-top text-[12px]">
              {t.defect ? <span className="tabular-nums text-ink" title={t.defect.title}>{t.defect.id}</span> : t.status === 'failed' ? <span className="text-warn">Triage</span> : <span className="text-ink-3">—</span>}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}
