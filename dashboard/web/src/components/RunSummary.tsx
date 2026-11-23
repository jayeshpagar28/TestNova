import { motion } from 'motion/react';
import { Activity, ChevronsRight, Gauge, Maximize2 } from 'lucide-react';
import type { RunSummary as Run } from '../data/model';
import { EASE_OUT } from '../theme';
import { dateTime, duration } from '../lib/format';
import { Card, DeltaPill } from './Card';

interface Row {
  label: string;
  sub: string;
  value: string;
  pill?: React.ReactNode;
}

function Column({ title, icon: Icon, rows, delay }: { title: string; icon: typeof Activity; rows: Row[]; delay: number }) {
  return (
    <div className="min-w-0">
      <motion.h3
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay }}
        className="flex items-center gap-2 text-[11.5px] uppercase tracking-[0.12em] text-ink"
      >
        <Icon size={15} className="text-ink-2" aria-hidden /> {title}
      </motion.h3>
      {/* timeline: a hairline down the left with a dot per row */}
      <ol className="relative mt-3 border-l border-white/[0.08] pl-4">
        {rows.map((r, i) => (
          <motion.li
            key={r.label}
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.5, delay: delay + 0.15 + i * 0.12, ease: EASE_OUT }}
            className="relative flex items-start justify-between gap-3 py-[9px]"
          >
            <span className="absolute -left-[19.5px] top-[15px] size-[7px] rounded-full border border-white/25 bg-[#2a2b33]" aria-hidden />
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[12px] uppercase tracking-[0.04em] text-ink">
                {r.label} <ChevronsRight size={12} className="text-ink-3" aria-hidden />
              </p>
              <p className="truncate text-[11px] text-ink-3">{r.sub}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="rounded-md border border-line bg-white/[0.03] px-1.5 py-0.5 text-[12px] tabular-nums text-ink">{r.value}</p>
              {r.pill && <div className="mt-1">{r.pill}</div>}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

const SCOPE = { regression: 'Regression', module: 'Module', test: 'Single test' } as const;

export function RunSummary({ run, sample, delay }: { run: Run | null; sample: boolean; delay: number }) {
  if (!run) {
    return (
      <Card delay={delay} className="flex h-full flex-col p-5" label="Latest run summary">
        <h2 className="text-[15px] font-medium text-ink">Latest Run Summary</h2>
        <p className="m-auto py-10 text-center text-[13px] text-ink-3">No execution has finished yet. Open a module and run it.</p>
      </Card>
    );
  }
  const { counts: c, prevCounts: p } = run;
  const executed = (x: typeof c) => x.passed + x.failed;
  const rate = (x: typeof c) => (executed(x) ? (x.passed / executed(x)) * 100 : null);
  const total = c.passed + c.failed + c.blocked + c.notrun;
  const vs = p ? 'vs previous execution' : 'First execution';
  const pill = (now: number, before: number | undefined, invert = false) =>
    before == null ? undefined : <DeltaPill value={now - before} suffix="" digits={0} invert={invert} />;
  const rNow = rate(c);
  const rPrev = p ? rate(p) : null;

  const overview: Row[] = [
    { label: 'Build', sub: 'APK under test', value: run.build ? `${run.build}${run.buildCode ? ` (${run.buildCode})` : ''}` : 'Unknown' },
    { label: 'Run ID', sub: SCOPE[run.scope], value: run.runId },
    { label: 'Started', sub: run.device ? `Browser ${run.device}` : 'No browser recorded', value: dateTime(run.startedAt) },
    { label: 'Finished', sub: run.scope === 'regression' ? 'All modules' : run.target ? `${run.module} · ${run.target}` : run.module, value: dateTime(run.endedAt) },
    {
      label: 'Duration',
      sub: run.modulesTotal ? `${run.modulesRun} of ${run.modulesTotal} modules` : 'Start to finish',
      value: duration(run.endedAt.getTime() - run.startedAt.getTime()),
    },
  ];
  const metrics: Row[] = [
    { label: 'Total tests', sub: sample || run.scope === 'regression' ? 'Across all modules' : 'In this execution', value: String(total) },
    { label: 'Passed', sub: vs, value: String(c.passed), pill: pill(c.passed, p?.passed) },
    { label: 'Failed', sub: vs, value: String(c.failed), pill: pill(c.failed, p?.failed, true) },
    { label: 'Blocked', sub: 'Prerequisite failed', value: String(c.blocked), pill: pill(c.blocked, p?.blocked, true) },
    { label: 'Pass rate', sub: 'Passed ÷ executed', value: rNow == null ? '—' : `${rNow.toFixed(1)}%`, pill: rNow != null && rPrev != null ? <DeltaPill value={rNow - rPrev} /> : undefined },
  ];

  return (
    <Card delay={delay} className="h-full p-5" label="Latest run summary">
      <div className="dot-mountain pointer-events-none absolute inset-x-0 bottom-0 h-[85%]" aria-hidden />
      <div className="relative flex items-center justify-between">
        <h2 className="text-[15px] font-medium text-ink">Latest Run Summary</h2>
        <Maximize2 size={14} className="text-ink-3" aria-hidden />
      </div>
      <div className="relative mt-5 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
        <Column title="Run overview" icon={Activity} rows={overview} delay={delay + 0.3} />
        <Column title="Run metrics" icon={Gauge} rows={metrics} delay={delay + 0.3 + overview.length * 0.12} />
      </div>
    </Card>
  );
}
