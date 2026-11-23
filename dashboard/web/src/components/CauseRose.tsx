import { useState } from 'react';
import { motion } from 'motion/react';
import { arc } from 'd3-shape';
import { Filter } from 'lucide-react';
import type { Cause } from '../theme';
import { CAUSE_ORDER, CAUSES, EASE_OUT } from '../theme';
import { Card, CardTitle } from './Card';

const SIZE = 236;
const C = SIZE / 2;
const R_MIN = 34;
const R_MAX = 104;

/**
 * Reference "TradeFi Performance": a rose of six equal-angle petals whose radius carries the
 * count. Radius grows with the square root so a petal's area, not its length, matches the count.
 */
export function CauseRose({ causes, delay }: { causes: Record<Cause, number>; delay: number }) {
  const [hover, setHover] = useState<Cause | null>(null);
  const total = CAUSE_ORDER.reduce((n, c) => n + causes[c], 0);
  const max = Math.max(1, ...CAUSE_ORDER.map((c) => causes[c]));
  const step = (Math.PI * 2) / CAUSE_ORDER.length;
  const radius = (v: number) => R_MIN + Math.sqrt(v / max) * (R_MAX - R_MIN);
  const rings = [0.25, 0.5, 0.75, 1].map((f) => R_MIN + f * (R_MAX - R_MIN));
  const focus = hover ?? null;

  return (
    <Card delay={delay} className="flex h-full flex-col p-5" label="Failure causes">
      <CardTitle right={<Filter size={15} className="text-ink-3" aria-hidden />}>Failure Causes</CardTitle>

      <div className="relative mx-auto mt-2" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`Failure causes of ${total} failed tests`}>
          <defs>
            <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="rgb(140 190 210 / 0.10)" strokeWidth="1.2" />
            </pattern>
            {CAUSE_ORDER.map((c) => (
              <radialGradient key={c} id={`petal-${c}`} cx={C} cy={C} r={R_MAX} gradientUnits="userSpaceOnUse">
                <stop offset="0.1" stopColor={CAUSES[c].color} stopOpacity="0.55" />
                <stop offset="1" stopColor={CAUSES[c].color} stopOpacity="1" />
              </radialGradient>
            ))}
          </defs>

          {/* chrome: hatched outer band and concentric rings, faint and static */}
          <motion.g initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} style={{ originX: 0.5, originY: 0.5 }} transition={{ duration: 0.9, delay: delay + 0.2, ease: EASE_OUT }}>
            <circle cx={C} cy={C} r={R_MAX + 10} fill="url(#hatch)" />
            <circle cx={C} cy={C} r={R_MAX - 6} fill="#1a1b1f" />
            {rings.map((r) => (
              <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="rgb(255 255 255 / 0.06)" />
            ))}
            <circle cx={C} cy={C} r={R_MAX + 10} fill="none" stroke="rgb(255 255 255 / 0.06)" />
          </motion.g>

          {/* Each petal animates in an untranslated wrapper so it scales and turns about the chart centre. */}
            {total > 0 && CAUSE_ORDER.map((c, i) => {
              const d = arc<unknown>()
                .innerRadius(5)
                .outerRadius(radius(causes[c]))
                .startAngle(i * step)
                .endAngle((i + 1) * step)
                .padAngle(0.05)
                .cornerRadius(10)({}) ?? '';
              const dim = focus && focus !== c;
              return (
                <motion.g
                  key={c}
                  initial={{ scale: 0, rotate: -50, opacity: 0 }}
                  animate={{ scale: focus === c ? 1.05 : 1, rotate: 0, opacity: dim ? 0.35 : 1 }}
                  style={{ originX: 0.5, originY: 0.5, transformBox: 'view-box' }}
                  transition={{
                    scale: { type: 'spring', stiffness: 120, damping: 14, delay: focus ? 0 : delay + 0.45 + i * 0.1 },
                    rotate: { duration: 1.1, delay: delay + 0.45 + i * 0.1, ease: EASE_OUT },
                    opacity: { duration: 0.3, delay: focus !== null ? 0 : delay + 0.45 + i * 0.1 },
                  }}
                  onMouseEnter={() => setHover(c)}
                  onMouseLeave={() => setHover(null)}
                  tabIndex={0}
                  onFocus={() => setHover(c)}
                  onBlur={() => setHover(null)}
                  aria-label={`${CAUSES[c].label}: ${causes[c]}`}
                  className="cursor-pointer outline-none"
                >
                  <path d={d} transform={`translate(${C},${C})`} fill={`url(#petal-${c})`} />
                </motion.g>
              );
            })}
          <circle cx={C} cy={C} r={5} fill="#2b2d36" />

          {/* ring scale up the vertical axis, as in the reference */}
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: total ? 1 : 0 }} transition={{ delay: delay + 1.2 }}>
            {rings.map((r, i) => (
              <text key={r} x={C + 3} y={C - r + 3} className="fill-ink-3 text-[8.5px] tabular-nums">
                {Math.round(((i + 1) / 4) ** 2 * max)}
              </text>
            ))}
          </motion.g>
        </svg>

        {focus && (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-line-2 bg-[#202128]/95 px-2.5 py-1.5 text-center shadow-xl">
            <p className="text-[11px] text-ink-2">{CAUSES[focus].label}</p>
            <p className="text-[13px] tabular-nums text-ink">
              {causes[focus]} <span className="text-ink-3">· {total ? Math.round((causes[focus] / total) * 100) : 0}%</span>
            </p>
          </div>
        )}
      </div>

      {total === 0 && <p className="-mt-1 text-center text-[11.5px] text-ink-3">No failed tests in the latest results.</p>}
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]" aria-label="Legend">
        {CAUSE_ORDER.map((c) => (
          <li
            key={c}
            onMouseEnter={() => setHover(c)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-1.5 transition-opacity ${focus && focus !== c ? 'opacity-40' : ''}`}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: CAUSES[c].color }} />
            <span className="truncate text-ink-2">{CAUSES[c].label}</span>
            <span className="ml-auto tabular-nums text-ink">{causes[c]}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
