import { useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import type { ModuleSummary } from '../data/model';
import { EASE_OUT, STATUS, STATUS_ORDER } from '../theme';
import { dateTime, time } from '../lib/format';
import { goModule } from '../lib/router';
import { CountUp } from './CountUp';
import { ModuleIcon } from './ModuleIcon';

/** Horizontal status bar: one segment per status, 2px surface gaps, filled in after the card lands. */
function StatusBar({ module, delay }: { module: ModuleSummary; delay: number }) {
  return (
    <div className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
      {STATUS_ORDER.map((s, i) => {
        const share = module.counts[s] / Math.max(1, module.total);
        if (!share) return null;
        return (
          <motion.span
            key={s}
            className="h-full rounded-full"
            // originX 0: each segment grows from its left edge, so the bar reads as filling up
            style={{ background: STATUS[s].color, flexBasis: `${share * 100}%`, originX: 0 }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, delay: delay + i * 0.12, ease: EASE_OUT }}
          />
        );
      })}
    </div>
  );
}

const sameDay = (d: Date) => d.toDateString() === new Date().toDateString();

function ModuleCard({ m, index, running }: { m: ModuleSummary; index: number; running: boolean }) {
  const delay = 0.6 + index * 0.05;
  const label = `${m.name}: ${m.total} tests, ${m.counts.passed} passed, ${m.counts.failed} failed, ${m.counts.blocked} blocked, ${m.counts.notrun} not executed, ${m.passRate == null ? 'not executed yet' : `pass rate ${m.passRate.toFixed(1)}%`}`;
  return (
    <motion.article
      aria-label={label}
      initial={{ opacity: 0, x: 28, filter: 'blur(8px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
      whileHover={{ y: -3 }}
      className={`group relative w-[236px] shrink-0 snap-start overflow-hidden rounded-[20px] border bg-card p-4 transition-colors ${
        running ? 'border-electric/70 shadow-[0_0_28px_-6px_rgb(47_123_255/0.6)]' : 'border-line hover:border-line-2'
      }`}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-lilac/10 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full border border-line bg-white/[0.04] text-ink-2">
          <ModuleIcon name={m.icon} size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] text-ink">{m.name}</p>
          <p className="text-[11px] text-ink-3">#{String(m.order).padStart(2, '0')} · {m.total} tests</p>
        </div>
        {running && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-electric/15 px-2 py-0.5 text-[10px] text-[#8fb4ff]">
            <span className="live-dot size-1.5 rounded-full bg-electric" /> Running
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        {m.passRate == null ? (
          <span className="text-[28px] font-light leading-none text-ink-3">—</span>
        ) : (
          <CountUp value={m.passRate} format={(n) => `${n.toFixed(1)}%`} delay={delay + 0.2} className="text-[28px] font-light leading-none text-ink" />
        )}
        <span className="text-[11px] text-ink-3">pass rate</span>
      </div>

      <div className="mt-3">
        <StatusBar module={m} delay={delay + 0.35} />
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-1 text-[11px]">
        {STATUS_ORDER.map((s) => (
          <div key={s}>
            <dt className="flex items-center gap-1 text-ink-3">
              <span className="size-1.5 rounded-full" style={{ background: STATUS[s].color }} />
              {s === 'notrun' ? 'Not run' : STATUS[s].label}
            </dt>
            <dd className="mt-0.5 tabular-nums text-ink">{m.counts[s]}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-[11px] text-ink-3" title={m.lastRun ? dateTime(m.lastRun) : undefined}>
          {m.lastRun ? `Last run ${sameDay(m.lastRun) ? time(m.lastRun) : dateTime(m.lastRun)}` : 'Never run'}
        </span>
        <button
          onClick={() => goModule(m.id)}
          aria-label={`Open ${m.name}`}
          className="flex items-center gap-0.5 rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-[11px] text-ink-2 transition hover:border-white/30 hover:bg-white hover:text-[#111]"
        >
          Open <ChevronRight size={11} />
        </button>
      </div>
    </motion.article>
  );
}

export function ModuleStrip({ modules, runningId }: { modules: ModuleSummary[]; runningId: string | null }) {
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 500, behavior: 'smooth' });

  return (
    <section aria-label="Modules">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="mb-3 flex items-center justify-between"
      >
        <h2 className="text-[15px] font-medium text-ink">
          Modules <span className="ml-1 text-ink-3">{modules.length}</span>
        </h2>
        <div className="flex gap-2">
          {([-1, 1] as const).map((d) => (
            <button
              key={d}
              onClick={() => scroll(d)}
              aria-label={d < 0 ? 'Scroll modules left' : 'Scroll modules right'}
              className="grid size-8 place-items-center rounded-full border border-line text-ink-2 transition hover:border-line-2 hover:text-ink"
            >
              {d < 0 ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
            </button>
          ))}
        </div>
      </motion.div>
      <div ref={scroller} className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {modules.map((m, i) => (
          <ModuleCard key={m.id} m={m} index={i} running={m.id === runningId} />
        ))}
      </div>
    </section>
  );
}
