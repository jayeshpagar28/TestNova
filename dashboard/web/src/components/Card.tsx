import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { EASE_OUT } from '../theme';

/**
 * The glass panel every widget sits in. It arrives the way the reference's widgets come into
 * focus: rising a little, out of a blur. `delay` places it in the page-load sequence.
 */
export function Card({
  children,
  className = '',
  delay = 0,
  glow = false,
  as = 'section',
  label,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  glow?: boolean;
  as?: 'section' | 'div' | 'article';
  label?: string;
}) {
  const Tag = motion[as];
  return (
    <Tag
      aria-label={label}
      initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, delay, ease: EASE_OUT }}
      className={`relative overflow-hidden rounded-[22px] border border-line ${glow ? 'glow-card' : 'bg-card'} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-medium tracking-wide text-ink">{children}</h2>
      {right}
    </div>
  );
}

/** The small segmented pill group of the reference (1h 2h 4h D W M / 1D 1W). */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1 rounded-full border border-line bg-white/[0.02] p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative h-7 min-w-7 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[11px] transition-colors ${active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
          >
            {active && (
              <motion.span
                layoutId={`chip-${label}`}
                className="absolute inset-0 rounded-full border border-lilac/50 bg-white/[0.06] shadow-[0_0_12px_rgb(169_156_255/0.25)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Green/red delta pill, as next to every price in the reference. */
export function DeltaPill({ value, suffix = '%', invert = false, digits = 1 }: { value: number; suffix?: string; invert?: boolean; digits?: number }) {
  const good = invert ? value <= 0 : value >= 0;
  const text = `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}${suffix}`;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-px text-[10.5px] tabular-nums ${
        good ? 'border-good/40 bg-good/10 text-good' : 'border-bad/40 bg-bad/15 text-bad'
      }`}
    >
      {text}
    </span>
  );
}
