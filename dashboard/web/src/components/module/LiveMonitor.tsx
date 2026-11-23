import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Radio, Square } from 'lucide-react';
import type { Run } from '../../data/api';
import { EASE_OUT } from '../../theme';
import { clock, timeOfDay } from '../../lib/format';
import { Card } from '../Card';

function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Tally({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="min-w-[72px] rounded-2xl border border-line bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
        <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-light tabular-nums text-ink">{value}</div>
    </div>
  );
}

/** Everything the run is doing right now. Shown only while there is an execution to watch. */
export function LiveMonitor({ run, canControl, onStop }: { run: Run; canControl: boolean; onStop: () => void }) {
  const now = useNow();
  const inScope = run.tests.filter((t) => run.scope === 'module' || t.key === run.target?.key);
  const c = { passed: 0, failed: 0, skipped: 0, pending: 0 };
  for (const t of inScope) {
    if (t.status === 'passed') c.passed += 1;
    if (t.status === 'failed') c.failed += 1;
    if (t.status === 'skipped' || t.status === 'blocked') c.skipped += 1;
    if (t.status === 'pending' || t.status === 'running') c.pending += 1;
  }
  const done = inScope.length - c.pending;
  const share = inScope.length ? done / inScope.length : 0;
  const currentTest = run.tests.find((t) => t.key === run.currentKey);

  return (
    <Card glow className="p-5" label="Live execution">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-2 text-[13px] text-ink">
          <Radio size={14} className="live-dot text-electric" aria-hidden /> Live execution
        </span>
        <span className="text-[12px] text-ink-2">{run.id}</span>
        <span className="text-[12px] text-ink-2">Started <span className="text-ink tabular-nums">{timeOfDay(run.startedAt)}</span></span>
        <span className="text-[12px] text-ink-2">Elapsed <span className="text-ink tabular-nums">{clock(now - run.startedAt)}</span></span>
        {canControl && (
          <button onClick={onStop} className="ml-auto flex items-center gap-2 rounded-full border border-line-2 px-3.5 py-1.5 text-[12px] text-ink hover:bg-white/[0.06]">
            <Square size={10} fill="currentColor" /> Stop execution
          </button>
        )}
      </div>

      <div className="mt-4" role="progressbar" aria-label="Execution progress" aria-valuemin={0} aria-valuemax={inScope.length} aria-valuenow={done}>
        <div className="flex justify-between text-[12px] text-ink-2">
          <span>{done} of {inScope.length} test cases</span>
          <span className="tabular-nums text-ink">{Math.round(share * 100)}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-lilac to-electric shadow-[0_0_10px_rgb(47_123_255/0.8)]"
            animate={{ width: `${share * 100}%` }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-stretch gap-3">
        <div className="min-w-[240px] flex-1 overflow-hidden rounded-2xl border border-electric/40 bg-electric/10 px-4 py-2.5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-ink-2">Now executing</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={run.currentKey ?? 'waiting'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="mt-1 truncate text-[13.5px] text-ink"
            >
              {currentTest ? (
                <>
                  <span className="tabular-nums text-ink-2">{currentTest.id}</span> {currentTest.scenario}
                  {currentTest.retry ? <span className="text-warn"> (retry {currentTest.retry})</span> : null}
                </>
              ) : (
                <span className="text-ink-2">{done ? 'Moving to the next test' : 'Starting the browser and the suite'}</span>
              )}
            </motion.p>
          </AnimatePresence>
        </div>
        <Tally label="Passed" value={c.passed} color="var(--color-passed)" />
        <Tally label="Failed" value={c.failed} color="var(--color-failed)" />
        <Tally label="Skipped" value={c.skipped} color="var(--color-ink-2)" />
        <Tally label="Pending" value={c.pending} color="var(--color-notrun)" />
      </div>
    </Card>
  );
}
