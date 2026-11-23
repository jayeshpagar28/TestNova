import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { scaleBand, scaleLinear } from 'd3-scale';
import type { TrendPoint } from '../data/model';
import { EASE_OUT, STATUS, STATUS_ORDER } from '../theme';
import { shortDate } from '../lib/format';
import { useSize } from '../lib/use-size';
import { Card, CardTitle, Chips } from './Card';

type Range = '10' | '20' | '40';
const PLOT_H = 230;
const M = { top: 8, right: 4, bottom: 26, left: 34 };

/** A rect with only its top corners rounded — the data end; the baseline end stays square. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function TrendChart({ trend, delay }: { trend: TrendPoint[]; delay: number }) {
  const [range, setRange] = useState<Range>('40');
  const [hover, setHover] = useState<number | null>(null);
  const [ref, { width }] = useSize<HTMLDivElement>();
  const points = useMemo(() => trend.slice(-Number(range)), [trend, range]);

  const innerW = Math.max(0, width - M.left - M.right);
  const max = Math.max(1, ...trend.map((p) => STATUS_ORDER.reduce((n, s) => n + p.counts[s], 0)));
  const y = scaleLinear().domain([0, max]).nice(4).range([PLOT_H, 0]);
  const x = scaleBand<number>()
    .domain(points.map((_, i) => i))
    .range([0, innerW])
    .paddingInner(points.length > 20 ? 0.22 : 0.3)
    .paddingOuter(0.1);
  const bw = x.bandwidth();
  // about one date per 70px, so labels never collide on a narrow screen
  const labelEvery = Math.ceil(points.length / Math.max(2, Math.min(8, Math.floor(innerW / 70))));
  const hovered = hover != null ? points[hover] : null;

  return (
    <Card delay={delay} className="flex h-full flex-col p-5" label="Execution trend">
      <CardTitle
        right={
          <Chips<Range>
            label="Trend range"
            value={range}
            onChange={setRange}
            options={[
              { value: '10', label: '10 runs' },
              { value: '20', label: '20' },
              { value: '40', label: '40' },
            ]}
          />
        }
      >
        Execution Trend
      </CardTitle>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-2" aria-label="Legend">
        {[...STATUS_ORDER].reverse().map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="size-2 rounded-[3px]" style={{ background: STATUS[s].color }} />
            {STATUS[s].label}
          </li>
        ))}
      </ul>

      <div ref={ref} className="relative mt-3 w-full" style={{ height: PLOT_H + M.top + M.bottom }}>
        {!trend.length && <p className="absolute inset-0 grid place-items-center text-[13px] text-ink-3">No executions yet. Each one adds a bar.</p>}
        {width > 0 && trend.length > 0 && (
          <svg width={width} height={PLOT_H + M.top + M.bottom} role="img" aria-label={`Stacked bars of test results for the last ${points.length} runs`}>
            <g transform={`translate(${M.left},${M.top})`}>
              {y.ticks(4).map((t) => (
                <g key={t} transform={`translate(0,${y(t)})`}>
                  <line x1={0} x2={innerW} stroke="rgb(255 255 255 / 0.05)" />
                  <text x={-8} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[10.5px] tabular-nums">
                    {t}
                  </text>
                </g>
              ))}

              {hover != null && (
                <rect x={(x(hover) ?? 0) - 3} width={bw + 6} y={0} height={PLOT_H} rx={4} fill="rgb(255 255 255 / 0.05)" />
              )}

              <g key={range}>
                {points.map((p, i) => {
                  let acc = 0;
                  const stack = STATUS_ORDER.map((s) => {
                    const y0 = acc;
                    acc += p.counts[s];
                    return { s, y0, y1: acc };
                  }).filter((d) => d.y1 > d.y0);
                  const top = stack.at(-1)?.s;
                  const dim = hover != null && hover !== i;
                  return (
                    <motion.g
                      key={p.runId}
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: 1, opacity: dim ? 0.45 : 1 }}
                      style={{ originY: 1 }}
                      transition={{
                        scaleY: { duration: 0.9, delay: delay + 0.35 + i * (1.1 / points.length), ease: EASE_OUT },
                        opacity: { duration: 0.25 },
                      }}
                    >
                      {stack.map(({ s, y0, y1 }) => {
                        const yTop = y(y1);
                        // 2px surface gap between stacked segments
                        const h = Math.max(0, y(y0) - yTop - (s === top ? 0 : 2));
                        const bx = x(i) ?? 0;
                        return s === top ? (
                          <path key={s} d={topRounded(bx, yTop, bw, h, 4)} fill={STATUS[s].color} />
                        ) : (
                          <rect key={s} x={bx} y={yTop + 2} width={bw} height={h} fill={STATUS[s].color} />
                        );
                      })}
                    </motion.g>
                  );
                })}
              </g>

              {points.map((p, i) =>
                i % labelEvery === 0 || i === points.length - 1 ? (
                  <text
                    key={p.runId}
                    x={i === 0 ? (x(i) ?? 0) : i === points.length - 1 ? (x(i) ?? 0) + bw : (x(i) ?? 0) + bw / 2}
                    y={PLOT_H + 17}
                    textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                    className="fill-ink-3 text-[10.5px]"
                  >
                    {shortDate(p.at)}
                  </text>
                ) : null,
              )}

              {/* hit areas: the full column, gaps included */}
              {points.map((p, i) => (
                <rect
                  key={p.runId}
                  x={(x(i) ?? 0) - (x.step() - bw) / 2}
                  width={x.step()}
                  y={0}
                  height={PLOT_H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${p.runId}, build ${p.build}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              ))}
            </g>
          </svg>
        )}

        <AnimatePresence>
          {hovered && hover != null && (
            <motion.div
              key="tip"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute top-1 z-10 w-[188px] rounded-xl border border-line-2 bg-[#202128]/95 p-3 shadow-2xl backdrop-blur"
              style={{
                left: Math.min(Math.max(M.left + (x(hover) ?? 0) + bw / 2 - 94, 0), width - 188),
              }}
            >
              <p className="text-[11.5px] text-ink">
                {shortDate(hovered.at)} {hovered.at.getFullYear()} · <span className="text-ink-2">{hovered.build}</span>
              </p>
              <p className="text-[10.5px] text-ink-3">{hovered.runId}{hovered.module && ` · ${hovered.module}`}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                {[...STATUS_ORDER].reverse().map((s) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-[3px]" style={{ background: STATUS[s].color }} />
                    <dt className="sr-only">{STATUS[s].label}</dt>
                    <dd className="tabular-nums text-ink">{hovered.counts[s]}</dd>
                    <span className="text-ink-3">{s === 'notrun' ? 'not run' : STATUS[s].label.toLowerCase()}</span>
                  </div>
                ))}
              </dl>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <table className="sr-only">
        <caption>Execution trend, last {points.length} runs</caption>
        <thead>
          <tr>
            <th>Run</th>
            <th>Build</th>
            {STATUS_ORDER.map((s) => (
              <th key={s}>{STATUS[s].label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.runId}>
              <td>{p.runId}</td>
              <td>{p.build}</td>
              {STATUS_ORDER.map((s) => (
                <td key={s}>{p.counts[s]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
