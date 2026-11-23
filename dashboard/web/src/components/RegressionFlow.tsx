import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Layers, Maximize2 } from 'lucide-react';
import type { Regression } from '../data/api';
import type { ModuleSummary } from '../data/model';
import { EASE_OUT, PARTICLES, STATUS } from '../theme';
import { useSize } from '../lib/use-size';
import { goRegression } from '../lib/router';
import { Card } from './Card';
import { CountUp } from './CountUp';
import { ModuleIcon } from './ModuleIcon';
import { ORB_SIZE, Orb } from './Orb';

const H = 480;
const PAD_Y = 30;
const LABEL_W = 178;
const NODE_W = 132;
const NODE_H = 56;

/** A bright dash that runs the length of a path: dash pattern on a pathLength-normalised path. */
function Comet({ d, color, delay, duration = 1.3, repeat = 0, repeatDelay = 0 }: {
  d: string; color: string; delay: number; duration?: number; repeat?: number; repeatDelay?: number;
}) {
  return (
    <motion.path
      d={d}
      pathLength={100}
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeDasharray="9 100"
      filter="url(#comet-glow)"
      initial={{ strokeDashoffset: 9, opacity: 0 }}
      animate={{ strokeDashoffset: -100, opacity: [0, 1, 1, 0] }}
      transition={{ duration, delay, repeat, repeatDelay, ease: 'easeInOut', times: [0, 0.1, 0.85, 1] }}
    />
  );
}

/**
 * Reference: orb → "24 Related Federal Laws" node → fan of lines to 20 assets, with coloured
 * comets running along them. Here: the build under test → the module sequence → each module,
 * with its pass rate and change since the previous build.
 *
 * While a (preview) run is in progress only the running module's line carries comets, finished
 * modules' lines take their result colour, and the orb's ring speeds up — motion means activity.
 */
export function RegressionFlow({
  modules,
  build,
  total,
  runningIndex,
  outcomes,
  delay,
}: {
  modules: ModuleSummary[];
  build: { version: string | null; code: string | null };
  total: number;
  runningIndex: number | null;
  /** each module's result so far in the running regression, in run order */
  outcomes?: Regression['modules'][number]['status'][];
  delay: number;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const reduce = useReducedMotion();
  const running = runningIndex != null;
  const compact = width < 560;
  // Too narrow for a fan (phones): the orb alone, with the sequence as a plain list below it.
  const narrow = width > 0 && width < 480;

  const orbX = compact ? 96 : 128;
  const cy = H / 2;
  const nodeX = orbX + (compact ? 92 : 128);
  const startX = nodeX + NODE_W;
  const endX = Math.max(startX + 80, width - (compact ? 118 : LABEL_W) - 10);

  const lines = useMemo(
    () =>
      modules.map((m, i) => {
        const y = PAD_Y + (i * (H - PAD_Y * 2)) / Math.max(1, modules.length - 1);
        const dx = endX - startX;
        const d = `M${startX},${cy} C${startX + dx * 0.42},${cy} ${startX + dx * 0.5},${y} ${endX},${y}`;
        return { m, y, d };
      }),
    [modules, startX, endX, cy],
  );

  // Idle shimmer: after the intro, an occasional comet on a random line, as in the reference.
  const [ambient, setAmbient] = useState<{ i: number; n: number } | null>(null);
  useEffect(() => {
    if (reduce || running) return;
    let n = 0;
    let tick: number | undefined;
    const start = window.setTimeout(() => {
      tick = window.setInterval(() => setAmbient({ i: Math.floor(Math.random() * modules.length), n: (n += 1) }), 900);
    }, (delay + 3.2) * 1000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(tick);
    };
  }, [reduce, running, modules.length, delay]);

  const lineColor = (i: number) => {
    // A finished regression (regression page only): every line keeps its module's outcome.
    const settled = !running && outcomes && outcomes[i] !== 'notrun' && outcomes[i] !== 'pending';
    if (!settled && (!running || i >= runningIndex!)) return 'url(#fan-stroke)';
    const outcome = outcomes?.[i];
    if (outcome === 'passed') return STATUS.passed.color;
    if (outcome === 'failed' || outcome === 'error') return STATUS.failed.color;
    return STATUS.notrun.color; // skipped, stopped: nothing to judge
  };
  const current = running ? modules[runningIndex!] : null;

  return (
    <Card delay={delay} className="h-full p-5" label="Regression flow">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium text-ink">Regression Flow</h2>
        <div className="flex items-center gap-3 text-[11.5px] text-ink-3">
          <span>{running ? `Running ${runningIndex! + 1} of ${modules.length}` : 'Sequence · run-ordered'}</span>
          <button onClick={() => goRegression()} aria-label="Open the regression execution page" title="Open the regression execution page" className="grid place-items-center hover:text-ink">
            <Maximize2 size={14} aria-hidden />
          </button>
        </div>
      </div>

      <div ref={ref} className="relative mt-2 w-full" style={{ height: narrow ? ORB_SIZE + 20 : H }}>
        {narrow && (
          <>
            <div className="absolute left-1/2 top-2 -translate-x-1/2">
              <Orb energy={running ? 1.6 : 1} />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-[44px] text-center">
              <p className="text-[10.5px] text-ink-2">Regression build</p>
              <p className="text-[12px] text-ink">{build.version}</p>
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-[178px] text-center">
              <p className="text-[24px] font-light leading-tight text-ink">{total}</p>
              <p className="text-[11px] text-ink-2">{running ? `Running ${runningIndex! + 1} of ${modules.length}` : `${modules.length} modules · ready`}</p>
            </div>
          </>
        )}
        {width > 0 && !narrow && (
          <>
            {/* orb */}
            <motion.div
              className="absolute"
              style={{ left: orbX - ORB_SIZE / 2, top: cy - ORB_SIZE / 2 }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.1, delay: delay + 0.1, ease: EASE_OUT }}
            >
              <Orb energy={running ? 1.6 : 1} />
            </motion.div>
            <motion.div
              className="pointer-events-none absolute text-center"
              style={{ left: orbX - 90, width: 180, top: cy - 104 }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: delay + 0.5 }}
            >
              <p className="text-[10.5px] text-ink-2">Regression build</p>
              <p className="text-[12px] text-ink">{build.version} <span className="text-ink-3">({build.code})</span></p>
            </motion.div>
            <motion.div
              className="pointer-events-none absolute text-center"
              style={{ left: orbX - 90, width: 180, top: cy + 60 }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: delay + 0.6 }}
            >
              <CountUp value={total} delay={delay + 0.6} className="block text-[30px] font-light leading-tight text-ink" />
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-2">
                {modules.length} modules
                <span className={`size-1.5 rounded-full ${running ? 'live-dot bg-electric' : 'bg-lilac'}`} />
                {running ? 'running' : 'ready'}
              </p>
            </motion.div>

            <svg width={width} height={H} className="absolute inset-0 overflow-visible" role="img" aria-label={`Regression sequence of ${modules.length} modules for build ${build.version}`}>
              <defs>
                <linearGradient id="fan-stroke" gradientUnits="userSpaceOnUse" x1={startX} x2={endX} y1={0} y2={0}>
                  <stop offset="0" stopColor="rgb(200 210 255 / 0.55)" />
                  <stop offset="1" stopColor="rgb(200 205 230 / 0.28)" />
                </linearGradient>
                <filter id="comet-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.2" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* orb → node */}
              <motion.path
                d={`M${orbX + 62},${cy} L${nodeX},${cy}`}
                stroke="#2F7BFF"
                strokeOpacity={0.75}
                strokeWidth={1.3}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: delay + 0.7, ease: EASE_OUT }}
              />
              {!reduce && <Comet d={`M${orbX + 62},${cy} L${nodeX},${cy}`} color="#2F7BFF" delay={delay + 0.75} duration={0.9} repeat={running ? Infinity : 0} repeatDelay={0.4} />}

              {/* fan */}
              {lines.map(({ m, d }, i) => (
                <motion.path
                  key={m.id}
                  d={d}
                  fill="none"
                  stroke={lineColor(i)}
                  strokeWidth={running && i === runningIndex ? 1.8 : 1.1}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: running && i > runningIndex! ? 0.45 : 1 }}
                  transition={{ pathLength: { duration: 0.9, delay: delay + 1.3 + i * 0.07, ease: EASE_OUT }, opacity: { duration: 0.4 } }}
                />
              ))}

              {!reduce &&
                !running &&
                lines.map(({ m, d }, i) => (
                  <Comet key={`intro-${m.id}`} d={d} color={PARTICLES[i % PARTICLES.length]} delay={delay + 1.5 + i * 0.09} />
                ))}
              {!reduce && !running && ambient && lines[ambient.i] && (
                <Comet key={`amb-${ambient.n}`} d={lines[ambient.i].d} color={PARTICLES[ambient.n % PARTICLES.length]} delay={0} duration={1.6} />
              )}
              {/* the module list can be empty (dashboard data not loaded yet) while the regression runs */}
              {!reduce &&
                running &&
                lines[runningIndex!] &&
                [0, 1, 2].map((k) => (
                  <Comet
                    key={`run-${runningIndex}-${k}`}
                    d={lines[runningIndex!].d}
                    color={PARTICLES[(runningIndex! + k) % PARTICLES.length]}
                    delay={k * 0.45}
                    duration={1.2}
                    repeat={Infinity}
                    repeatDelay={0.15}
                  />
                ))}

              {lines.map(({ m, y }, i) => (
                <motion.circle
                  key={`dot-${m.id}`}
                  cx={endX}
                  cy={y}
                  r={2.4}
                  fill={running && i < runningIndex! ? lineColor(i) : '#cfd3ea'}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: delay + 2 + i * 0.07 }}
                />
              ))}
            </svg>

            {/* node card */}
            <motion.div
              className="shine absolute overflow-hidden rounded-xl border-[1.5px] border-electric bg-[#14161c] px-3 py-2 shadow-[0_0_24px_-4px_rgb(47_123_255/0.65),inset_0_0_12px_rgb(47_123_255/0.15)]"
              style={{ left: nodeX, top: cy - NODE_H / 2, width: NODE_W, height: NODE_H }}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: delay + 1.05, ease: EASE_OUT }}
            >
              <div className="flex items-center gap-1.5 text-[17px] leading-none text-ink">
                <Layers size={13} className="text-ink-2" aria-hidden />
                {running ? `${runningIndex! + 1}/${modules.length}` : modules.length}
              </div>
              <p className="mt-1.5 truncate text-[10.5px] text-ink-2">{current ? current.name : 'Modules in sequence'}</p>
            </motion.div>

            {/* labels */}
            <ul aria-label="Modules in run order">
              {lines.map(({ m, y }, i) => {
                const delta = m.passRate != null && m.prevPassRate != null ? m.passRate - m.prevPassRate : null;
                const state = !running ? null : i < runningIndex! ? 'done' : i === runningIndex ? 'run' : 'wait';
                return (
                  <motion.li
                    key={m.id}
                    className={`absolute flex items-center gap-1.5 text-[11.5px] transition-opacity ${state === 'wait' ? 'opacity-45' : ''}`}
                    style={{ left: endX + 8, top: y - 9, width: (compact ? 118 : LABEL_W) - 4 }}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: delay + 1.75 + i * 0.07, ease: EASE_OUT }}
                  >
                    <span
                      className={`grid size-[18px] shrink-0 place-items-center rounded-full border ${
                        state === 'run' ? 'border-electric bg-electric/25 text-white' : 'border-line bg-white/[0.05] text-ink-2'
                      }`}
                    >
                      <ModuleIcon name={m.icon} size={10} />
                    </span>
                    <span className={`truncate ${state === 'run' ? 'text-white' : 'text-ink'}`}>{m.name}</span>
                    {!compact && (
                      <>
                        <span className="ml-auto tabular-nums text-ink-2">{m.passRate == null ? '—' : `${m.passRate.toFixed(0)}%`}</span>
                        <span className={`w-[38px] text-right tabular-nums text-[10px] ${delta == null ? 'text-ink-3' : delta >= 0 ? 'text-good' : 'text-bad'}`}>
                          {delta != null && `${delta >= 0 ? '▲' : '▼'}${Math.abs(delta).toFixed(1)}`}
                        </span>
                      </>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {narrow && (
        <ol className="mt-2 grid grid-cols-1 gap-1.5" aria-label="Modules in run order">
          {modules.map((m, i) => {
            const state = !running ? null : i < runningIndex! ? 'done' : i === runningIndex ? 'run' : 'wait';
            return (
              <li
                key={m.id}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] ${
                  state === 'run' ? 'border-electric/70 bg-electric/10' : 'border-line'
                } ${state === 'wait' ? 'opacity-50' : ''}`}
              >
                <ModuleIcon name={m.icon} size={12} className="text-ink-2" />
                <span className="truncate text-ink">{m.name}</span>
                <span className="ml-auto tabular-nums text-ink-2">{m.passRate == null ? '—' : `${m.passRate.toFixed(0)}%`}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
