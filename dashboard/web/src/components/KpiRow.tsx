import { motion } from 'motion/react';
import type { DashboardData } from '../data/model';
import { Card, DeltaPill } from './Card';
import { CountUp } from './CountUp';
import { EASE_OUT } from '../theme';

/* ── the four decorative glyphs of the reference's stat cards, redrawn to draw themselves in ── */

const draw = (delay: number) => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: { duration: 1.1, delay, ease: EASE_OUT },
});

/** Candlesticks — reference "Market Cap". */
function Candles({ delay }: { delay: number }) {
  const c = [
    { x: 8, y1: 26, y2: 50, b1: 32, b2: 44 },
    { x: 22, y1: 10, y2: 38, b1: 16, b2: 30 },
    { x: 36, y1: 4, y2: 30, b1: 8, b2: 22 },
    { x: 50, y1: 18, y2: 42, b1: 24, b2: 34 },
  ];
  return (
    <svg viewBox="0 0 60 56" className="h-14 w-16" aria-hidden>
      {c.map((k, i) => (
        <g key={i}>
          <motion.line x1={k.x} x2={k.x} y1={k.y1} y2={k.y2} stroke="#d9d6ff" strokeWidth={1.2} {...draw(delay + i * 0.1)} />
          <motion.rect
            x={k.x - 3.5}
            width={7}
            y={k.b1}
            height={k.b2 - k.b1}
            rx={2}
            fill="#eceaff"
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            style={{ transformBox: 'fill-box', originY: 0.5 }}
            transition={{ duration: 0.6, delay: delay + 0.3 + i * 0.1, ease: EASE_OUT }}
          />
        </g>
      ))}
    </svg>
  );
}

/** Ribbon curve — reference "Future vs Spot Vol". */
function Ribbon({ delay }: { delay: number }) {
  return (
    <svg viewBox="0 0 72 56" className="h-14 w-[72px]" aria-hidden>
      <defs>
        <linearGradient id="ribbon" x1="0" x2="1">
          <stop offset="0" stopColor="#7b6ae6" />
          <stop offset="1" stopColor="#d9d6ff" />
        </linearGradient>
      </defs>
      <motion.path
        d="M4 8 C 14 6, 12 34, 24 36 S 34 18, 44 24 S 56 50, 68 40"
        fill="none"
        stroke="url(#ribbon)"
        strokeWidth={7}
        strokeLinecap="round"
        {...draw(delay)}
      />
    </svg>
  );
}

/** Mirrored waveform — reference "Altcoin Cycle Index". */
function Waveform({ delay }: { delay: number }) {
  const h = [6, 10, 16, 24, 34, 44, 30, 18, 38, 22, 12, 8, 5];
  return (
    <svg viewBox="0 0 64 56" className="h-14 w-16" aria-hidden>
      {h.map((v, i) => (
        <motion.line
          key={i}
          x1={4 + i * 4.6}
          x2={4 + i * 4.6}
          y1={28 - v / 2}
          y2={28 + v / 2}
          stroke="#e6e3ff"
          strokeWidth={1.3}
          strokeLinecap="round"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 0.4 + (v / 44) * 0.6 }}
          style={{ transformBox: 'fill-box', originY: 0.5 }}
          transition={{ duration: 0.7, delay: delay + i * 0.04, ease: EASE_OUT }}
        />
      ))}
    </svg>
  );
}

/** Pixel grid — reference "BTC Sharpe Signal". */
function Pixels({ delay }: { delay: number }) {
  const cells = [
    [0, 3, 0.15], [1, 3, 0.25], [2, 3, 0.35], [3, 3, 0.55], [4, 3, 0.9],
    [1, 2, 0.15], [2, 2, 0.3], [3, 2, 0.5], [4, 2, 0.75],
    [3, 1, 0.25], [4, 1, 0.55], [4, 0, 0.95],
  ] as const;
  return (
    <svg viewBox="0 0 64 56" className="h-14 w-16" aria-hidden>
      {cells.map(([x, y, o], i) => (
        <motion.rect
          key={i}
          x={4 + x * 12}
          y={4 + y * 12}
          width={10}
          height={10}
          rx={2}
          fill="#e6e3ff"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: o, scale: 1 }}
          style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}
          transition={{ duration: 0.5, delay: delay + i * 0.05, ease: EASE_OUT }}
        />
      ))}
    </svg>
  );
}

function Kpi({
  label, value, format, glyph, foot, delay,
}: {
  label: string;
  /** null: nothing measured yet, shown as a dash */
  value: number | null;
  format?: (n: number) => string;
  glyph: React.ReactNode;
  foot: React.ReactNode;
  delay: number;
}) {
  return (
    <Card glow delay={delay} className="group p-5 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-line-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-ink-2">{label}</p>
        <div className="-mr-1 -mt-1 opacity-90">{glyph}</div>
      </div>
      {value == null ? (
        <span className="-mt-2 block text-[44px] font-light leading-none text-ink-3" aria-label="Not measured yet">—</span>
      ) : (
        <CountUp value={value} format={format} delay={delay + 0.2} className="-mt-2 block text-[44px] font-light leading-none tracking-[-0.02em] text-ink" />
      )}
      <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-3">{foot}</div>
    </Card>
  );
}

/** Whole-suite figures: every test's latest result, across all modules. */
export function KpiRow({ data }: { data: DashboardData }) {
  const counts = data.modules.reduce(
    (c, m) => ({ passed: c.passed + m.counts.passed, failed: c.failed + m.counts.failed, blocked: c.blocked + m.counts.blocked, notrun: c.notrun + m.counts.notrun }),
    { passed: 0, failed: 0, blocked: 0, notrun: 0 },
  );
  const total = data.modules.reduce((n, m) => n + m.total, 0);
  const executed = counts.passed + counts.failed + counts.blocked;
  const passRate = counts.passed + counts.failed ? (counts.passed / (counts.passed + counts.failed)) * 100 : null;
  // Change since the suite's state before the latest execution (the trend's last two bars).
  const prev = data.trend.at(-2)?.counts;
  const prevRate = prev && prev.passed + prev.failed ? (prev.passed / (prev.passed + prev.failed)) * 100 : null;
  const base = 0.3;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="Total Test Cases"
        value={total}
        glyph={<Candles delay={base + 0.3} />}
        delay={base}
        foot={
          <>
            <span className="text-ink-2">{total ? `${((executed / total) * 100).toFixed(1)}%` : '—'}</span> executed · {data.modules.length} modules
          </>
        }
      />
      <Kpi
        label="Pass Rate"
        value={passRate}
        format={(n) => `${n.toFixed(1)}%`}
        glyph={<Ribbon delay={base + 0.38} />}
        delay={base + 0.08}
        foot={
          <>
            {passRate != null && prevRate != null && <DeltaPill value={passRate - prevRate} />} <span className="text-ink-2">{counts.passed}</span> passed
          </>
        }
      />
      <Kpi
        label="Failed"
        value={counts.failed}
        glyph={<Waveform delay={base + 0.46} />}
        delay={base + 0.16}
        foot={
          <>
            {prev && <DeltaPill value={counts.failed - prev.failed} suffix="" digits={0} invert />}
            <span className="text-ink-2">{counts.blocked}</span> blocked · <span className="text-ink-2">{counts.notrun}</span> not run
          </>
        }
      />
      <Kpi
        label="Open Defects"
        value={data.openDefects}
        glyph={<Pixels delay={base + 0.54} />}
        delay={base + 0.24}
        foot={
          <>
            New, Open or In Progress{data.unsetDefects > 0 && <> · <span className="text-ink-2">{data.unsetDefects}</span> without a status</>}
          </>
        }
      />
    </div>
  );
}
