import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Bug, Globe, Menu, Play } from 'lucide-react';
import { api, subscribeRuns, type ModuleView, type Run, type RunTest, type ServerStatus } from '../../data/api';
import { EASE_OUT } from '../../theme';
import { goDashboard } from '../../lib/router';
import { Card, CardTitle } from '../Card';
import { ModuleIcon } from '../ModuleIcon';
import { ExecutionHistory } from './ExecutionHistory';
import { ExecutionSummary, ReportMenu } from './ExecutionSummary';
import { LiveMonitor } from './LiveMonitor';
import { TestDetail } from './TestDetail';
import { TestTable, mergeLive, type Row } from './TestTable';
import { ThemeToggle } from '../ThemeToggle';
import { ProjectName } from '../ProjectName';

/** A state-changing step a module needs before its tests (none for web modules yet); confirmed first. */
const DEVICE_STEP: Record<string, string> = {
  reinstall: 'uninstall and reinstall the app',
  enrol: 'reinstall the app and sign in to enrol the device',
  reset: 'clear the app with a hard reset',
};

function RunButton({ running, disabled, title, onClick }: { running: boolean; disabled: boolean; title?: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-medium text-[#111] shadow-[0_0_24px_rgb(255_255_255/0.15)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Play size={13} fill="currentColor" /> {running ? 'Running…' : 'Run Module'}
    </motion.button>
  );
}

export function ModulePage({ id, onMenu }: { id: string; onMenu: () => void }) {
  const [view, setView] = useState<ModuleView | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [live, setLive] = useState<Run | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [open, setOpen] = useState<{ row: Row | RunTest; runId: string | null } | null>(null);
  const [confirm, setConfirm] = useState<string | null | undefined>(undefined);
  const wasLive = useRef(false);

  const load = useCallback(() => {
    api.module(id).then((v) => {
      setView(v);
      setLive(v.active);
      setError('');
    }).catch((e) => setError(e.message));
    api.status().then(setStatus).catch(() => setStatus(null));
  }, [id]);

  useEffect(() => {
    setView(null);
    setPicked(null);
    setOpen(null);
    load();
  }, [load]);

  useEffect(
    () =>
      subscribeRuns((r) => {
        setStatus((s) => (s ? { ...s, active: r.status === 'running' ? r.id : null } : s));
        if (r.moduleId !== id) return;
        if (r.status === 'running') {
          wasLive.current = true;
          setLive(r);
        } else {
          wasLive.current = false;
          setLive(null);
          setPicked(null);
          load();
        }
      }, (rg) => setStatus((s) => (s ? { ...s, regression: rg.status === 'running' ? rg.id : null } : s))),
    [id, load],
  );

  const selected = useMemo(() => {
    const done = view?.runs.filter((r) => r.status !== 'running') ?? [];
    return done.find((r) => r.id === picked) ?? done[0] ?? null;
  }, [view, picked]);

  useEffect(() => {
    if (!selected) return setRun(null);
    let stale = false;
    api.run(selected.id).then((r) => !stale && setRun(r)).catch(() => setRun(null));
    return () => {
      stale = true;
    };
  }, [selected]);

  const start = (testKey?: string) => {
    setConfirm(undefined);
    setError('');
    api.start(id, testKey).catch((e) => setError(e.message));
  };
  const requestRun = (testKey?: string) => {
    if (view?.module.deviceStep) setConfirm(testKey ?? null);
    else start(testKey);
  };

  if (error && !view) {
    return (
      <Card className="mt-10 p-8 text-center" label="Module unavailable">
        <p className="text-[15px] text-ink">This page needs the TestNova server.</p>
        <p className="mt-2 text-[13px] text-ink-2">{error}</p>
        <button onClick={goDashboard} className="mt-5 rounded-full border border-line-2 px-4 py-1.5 text-[13px] text-ink">Back to dashboard</button>
      </Card>
    );
  }
  if (!view) return <p className="py-20 text-center text-[13px] text-ink-3">Loading module…</p>;

  const { module } = view;
  const rows = mergeLive(view.tests, live);
  const canControl = status?.canControl ?? false;
  const inRegression = Boolean(status?.regression);
  const busyElsewhere = Boolean(status?.active) && !live;
  const running = Boolean(status?.active) || inRegression;
  const runTitle = !canControl
    ? 'Runs can only be started on the PC hosting TestNova'
    : inRegression
      ? 'A full regression is running; stop it from the dashboard to run this module on its own'
      : busyElsewhere
        ? 'Another module is executing; TestNova runs one at a time'
        : undefined;
  const defectFor = (key: string, fallback: Row | RunTest) => view.tests.find((t) => t.key === key)?.defect ?? ('defect' in fallback ? fallback.defect : null);

  return (
    <div className="flex flex-col gap-5">
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onMenu} aria-label="Open navigation" className="grid size-9 place-items-center rounded-full border border-line text-ink-2 lg:hidden"><Menu size={16} /></button>
          <button onClick={goDashboard} className="flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Dashboard</button>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-full border border-lilac/30 bg-lilac/15 text-lilac"><ModuleIcon name={module.icon} size={24} /></span>
            <div>
              <h1 className="text-[30px] font-light leading-tight tracking-[-0.01em] text-ink sm:text-[36px]">{module.name}<ProjectName /></h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
                <span>{module.total} test cases</span>
                <span className="flex items-center gap-1"><Bug size={12} aria-hidden /> {view.defects.length} associated {view.defects.length === 1 ? 'defect' : 'defects'}</span>
                <span className="flex items-center gap-1.5">
                  <Globe size={12} aria-hidden />
                  {status?.device.online ? `${status.device.id} · app reachable` : status?.device.detail ?? 'Browser unknown'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReportMenu run={selected} />
            <RunButton running={Boolean(live)} disabled={!canControl || running} title={runTitle} onClick={() => requestRun()} />
          </div>
        </div>
        {error && <p className="rounded-2xl border border-bad/40 bg-bad/10 px-4 py-2 text-[13px] text-ink">{error}</p>}
      </motion.header>

      <AnimatePresence>
        {live && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}>
            <LiveMonitor run={live} canControl={canControl} onStop={() => api.stop(live.id).catch((e) => setError(e.message))} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-12">
        <div className="min-w-0 2xl:col-span-8">
          <TestTable
            rows={rows}
            currentKey={live?.currentKey ?? null}
            canRun={canControl}
            running={running}
            onRun={requestRun}
            onOpen={(row) => setOpen({ row, runId: row.runId })}
          />
        </div>
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:col-span-4 2xl:grid-cols-1">
          <ExecutionSummary
            summary={selected}
            run={run}
            isLatest={!picked}
            onLatest={() => setPicked(null)}
            onOpenTest={(row) => run && setOpen({ row, runId: run.id })}
          />
          <ExecutionHistory runs={view.runs} selected={selected?.id ?? null} onSelect={setPicked} />
        </div>
      </div>

      {view.defects.length > 0 && (
        <Card className="p-5" delay={0.5} label="Associated defects">
          <CardTitle right={<span className="text-[12px] text-ink-3">{view.defects.length}</span>}>Associated defects</CardTitle>
          <ul className="mt-3 grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            {view.defects.map((d) => (
              <li key={d.id} className="flex items-baseline gap-3 border-b border-line py-2 text-[12.5px]">
                <span className="w-[92px] shrink-0 tabular-nums text-ink-2">{d.id}</span>
                <span className="min-w-0 flex-1 truncate text-ink" title={d.title}>{d.title || <span className="text-ink-3">{d.source}</span>}</span>
                <span className="shrink-0 text-ink-2">{d.status ?? 'Not set'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AnimatePresence>
        {open && (
          <TestDetail
            moduleId={id}
            row={open.row}
            plan={view.tests.find((t) => t.key === open.row.key) ?? null}
            moduleName={view.module.name}
            runId={open.runId}
            canControl={canControl}
            defect={defectFor(open.row.key, open.row)}
            onClose={() => setOpen(null)}
            onChanged={load}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirm !== undefined && module.deviceStep && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirm(undefined)} />
            <motion.div role="alertdialog" aria-label="Confirm device step" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="fixed left-1/2 top-1/3 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-[22px] border border-line-2 bg-panel p-6">
              <h2 className="text-[16px] text-ink">This run changes the application first</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                {module.name} needs a known starting state, so TestNova will {DEVICE_STEP[module.deviceStep] ?? module.deviceStep} before the tests begin.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setConfirm(undefined)} className="rounded-full border border-line-2 px-4 py-1.5 text-[13px] text-ink">Cancel</button>
                <button onClick={() => start(confirm ?? undefined)} className="rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-[#111]">Continue</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
