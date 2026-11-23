import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ModuleSummary } from '../data/model';
import { EASE_OUT } from '../theme';
import { Card, CardTitle, Chips, DeltaPill } from './Card';
import { ModuleIcon } from './ModuleIcon';

type Mode = 'top' | 'failing';

/** Reference "Top Gainers": rank, avatar, name, value, delta pill — here modules ranked by pass rate. */
export function Leaderboard({ modules, delay }: { modules: ModuleSummary[]; delay: number }) {
  const [mode, setMode] = useState<Mode>('top');
  // Rows stagger in behind the card on first load; after that a toggle re-ranks them at once.
  const settled = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => (settled.current = true), (delay + 1) * 1000);
    return () => clearTimeout(t);
  }, [delay]);
  const rows = useMemo(() => {
    const ranked = [...modules].filter((m) => m.counts.passed + m.counts.failed > 0);
    ranked.sort((a, b) => (mode === 'top' ? (b.passRate ?? 0) - (a.passRate ?? 0) || b.total - a.total : b.counts.failed - a.counts.failed));
    return ranked.slice(0, 6);
  }, [modules, mode]);

  return (
    <Card delay={delay} className="flex h-full flex-col p-5" label="Module leaderboard">
      <CardTitle
        right={
          <Chips<Mode>
            label="Leaderboard"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'failing', label: 'Failing' },
            ]}
          />
        }
      >
        Module Leaderboard
      </CardTitle>

      <ol className="mt-4 flex flex-1 flex-col gap-1">
        <AnimatePresence mode="popLayout">
          {rows.map((m, i) => (
            <motion.li
              layout
              key={m.id}
              initial={{ opacity: 0, x: 16, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.5, delay: (settled.current ? 0 : delay + 0.3) + i * 0.06, ease: EASE_OUT, layout: { type: 'spring', stiffness: 380, damping: 34 } }}
              className="flex items-center gap-3 rounded-xl px-1 py-[7px] transition-colors hover:bg-white/[0.03]"
            >
              <span className="w-7 shrink-0 rounded-md border border-line bg-white/[0.03] py-0.5 text-center text-[10.5px] text-ink-3">#{i + 1}</span>
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-gradient-to-br from-white/[0.08] to-transparent text-ink-2">
                <ModuleIcon name={m.icon} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] uppercase tracking-[0.04em] text-ink">{m.name}</p>
                <p className="text-[11px] text-ink-3">
                  {mode === 'top' ? `${m.counts.passed}/${m.counts.passed + m.counts.failed} passed` : `${m.counts.failed} failed of ${m.total}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="text-[13px] leading-none tabular-nums text-ink">{(m.passRate ?? 0).toFixed(1)}%</p>
                {m.passRate != null && m.prevPassRate != null && <DeltaPill value={m.passRate - m.prevPassRate} />}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {!rows.length && <p className="m-auto pb-6 text-center text-[12.5px] text-ink-3">No module has a passed or failed test yet.</p>}
    </Card>
  );
}
