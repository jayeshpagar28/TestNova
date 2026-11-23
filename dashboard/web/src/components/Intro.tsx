import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE_OUT } from '../theme';
import { Starfield } from './Starfield';

/** Seconds into the intro at which the warp hand-off to the dashboard begins. */
const LEAVE_AT = 4.6;
const LEAVE_AT_REDUCED = 1.6;
/** How long the warp runs before the dashboard takes over. */
const WARP = 0.75;

const LINE_1 = ['A', 'Universe', 'of'];
const LINE_2 = ['Autonomous', 'Testing'];

function Word({ text, delay, accent }: { text: string; delay: number; accent?: boolean }) {
  return (
    <motion.span
      className={`inline-block ${accent ? 'intro-accent' : ''}`}
      initial={{ opacity: 0, y: 28, filter: 'blur(14px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 1, delay, ease: EASE_OUT }}
    >
      {text}
    </motion.span>
  );
}

/**
 * The first thing a user sees: a starfield, the TestNova star igniting inside its orbit, the
 * tagline revealed word by word, then a warp jump into the dashboard. Click, Enter, Space or
 * Escape skips straight to the jump. Under "reduce motion" it is a short fade with no movement.
 */
export function Intro({ stats, onDone }: { stats: { tests: number; modules: number }; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    window.setTimeout(onDone, (reduce ? 0.3 : WARP) * 1000);
  }, [onDone, reduce]);

  useEffect(() => {
    const t = window.setTimeout(leave, (reduce ? LEAVE_AT_REDUCED : LEAVE_AT) * 1000);
    const key = (e: KeyboardEvent) => {
      if (['Enter', ' ', 'Escape'].includes(e.key)) leave();
    };
    window.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', key);
    };
  }, [leave, reduce]);

  return (
    <motion.div
      role="dialog"
      aria-label="TestNova — A Universe of Autonomous Testing"
      onClick={leave}
      className="keep-dark fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-page"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.7, ease: EASE_OUT } }}
    >
      {/* nebula: the purple and electric-blue light of the dashboard's glow cards and CTA */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.6 }}
        style={{
          background:
            'radial-gradient(60% 50% at 78% 12%, rgb(123 106 230 / 0.28), transparent 70%), radial-gradient(55% 50% at 18% 92%, rgb(47 123 255 / 0.22), transparent 70%), radial-gradient(40% 40% at 50% 50%, rgb(169 156 255 / 0.08), transparent 70%)',
        }}
      />
      <Starfield warp={leaving} />

      <motion.div
        className="relative flex h-full flex-col items-center justify-center px-6 text-center"
        animate={leaving ? { scale: reduce ? 1 : 1.6, opacity: 0, filter: reduce ? 'blur(0px)' : 'blur(12px)' } : { scale: 1, opacity: 1 }}
        transition={{ duration: leaving ? (reduce ? 0.3 : WARP) : 0.6, ease: [0.55, 0, 0.75, 0.2] }}
      >
        {/* the star in its orbit */}
        <div className="relative grid size-[132px] place-items-center sm:size-[156px]">
          <svg viewBox="0 0 160 160" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id="orbit" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#a99cff" />
                <stop offset="1" stopColor="#2f7bff" />
              </linearGradient>
            </defs>
            <motion.circle
              cx="80" cy="80" r="74" fill="none" stroke="url(#orbit)" strokeWidth="1.2" strokeLinecap="round"
              style={{ rotate: -90, originX: '80px', originY: '80px' }}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: 1.6, delay: 0.5, ease: EASE_OUT }}
            />
            <motion.circle
              cx="80" cy="80" r="58" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeDasharray="2 6"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1, rotate: 360 }}
              style={{ originX: '80px', originY: '80px' }}
              transition={{ opacity: { delay: 0.8, duration: 1 }, scale: { delay: 0.8, duration: 1, ease: EASE_OUT }, rotate: { duration: 30, repeat: Infinity, ease: 'linear' } }}
            />
            {/* a satellite riding the orbit — view-box origin, so it turns about the orbit's centre, not its own */}
            <motion.g
              style={{ originX: '80px', originY: '80px', transformBox: 'view-box' }}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 270, opacity: 1 }}
              transition={{ rotate: { duration: 6, delay: 1.2, repeat: Infinity, ease: 'linear' }, opacity: { delay: 1.2 } }}
            >
              <circle cx="154" cy="80" r="3" fill="#cfd8ff" />
              <circle cx="154" cy="80" r="7" fill="rgb(120 165 255 / 0.25)" />
            </motion.g>
          </svg>

          <motion.div
            className="absolute size-24 rounded-full bg-electric/40 blur-2xl"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0.65], scale: [0.4, 1.3, 1] }}
            transition={{ duration: 1.6, delay: 0.25, ease: EASE_OUT }}
            aria-hidden
          />
          <motion.svg
            viewBox="0 0 32 32"
            className="relative size-16 drop-shadow-[0_0_18px_rgb(120_165_255/0.8)] sm:size-[72px]"
            initial={{ scale: 0, rotate: -120, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 90, damping: 12, delay: 0.25 }}
            aria-hidden
          >
            <defs>
              <linearGradient id="intro-star" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="0.45" stopColor="#9dbbff" />
                <stop offset="1" stopColor="#2f7bff" />
              </linearGradient>
            </defs>
            <path d="M16 2c1.2 7 3.6 10.6 14 14-10.4 3.4-12.8 7-14 14-1.2-7-3.6-10.6-14-14C12.4 12.6 14.8 9 16 2z" fill="url(#intro-star)" />
            <circle cx="16" cy="16" r="2.4" fill="#fff" />
          </motion.svg>
        </div>

        {/* wordmark: letters close in from wide tracking */}
        <motion.p
          className="mt-7 text-[15px] font-medium text-ink sm:text-[17px]"
          initial={{ opacity: 0, letterSpacing: '0.9em' }}
          animate={{ opacity: 1, letterSpacing: '0.32em' }}
          transition={{ duration: 1.4, delay: 1, ease: EASE_OUT }}
        >
          TEST<span className="text-lilac">NOVA</span>
        </motion.p>

        <h1 className="mt-6 text-[clamp(2.1rem,6.4vw,5rem)] font-light leading-[1.08] tracking-[-0.02em] text-ink">
          <span className="flex flex-wrap justify-center gap-x-[0.26em]">
            {LINE_1.map((w, i) => (
              <Word key={w} text={w} delay={1.6 + i * 0.16} accent={w === 'Universe'} />
            ))}
          </span>
          <span className="flex flex-wrap justify-center gap-x-[0.26em]">
            {LINE_2.map((w, i) => (
              <Word key={w} text={w} delay={1.6 + (LINE_1.length + i) * 0.16} accent={w === 'Autonomous'} />
            ))}
          </span>
        </h1>

        <motion.p
          className="mt-5 max-w-md text-[13px] text-ink-2 sm:text-[14.5px]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 2.75, ease: EASE_OUT }}
        >
          Redefining Automation Through Intelligent AI
        </motion.p>

        {/* loader: fills over the intro, with the real catalogue size */}
        <motion.div
          className="mt-10 w-[min(280px,70vw)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3 }}
        >
          <div className="h-[2px] overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-lilac to-electric shadow-[0_0_10px_rgb(47_123_255/0.8)]"
              style={{ originX: 0 }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: (reduce ? LEAVE_AT_REDUCED : LEAVE_AT) - 3, delay: 3, ease: 'easeInOut' }}
            />
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-ink-3">
            Loading {stats.tests} tests · {stats.modules} modules
          </p>
        </motion.div>
      </motion.div>

      <motion.button
        onClick={(e) => {
          e.stopPropagation();
          leave();
        }}
        className="absolute bottom-6 right-6 rounded-full border border-line px-4 py-1.5 text-[12px] text-ink-2 backdrop-blur transition hover:border-line-2 hover:text-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ delay: leaving ? 0 : 1.2 }}
      >
        Skip intro
      </motion.button>
    </motion.div>
  );
}
