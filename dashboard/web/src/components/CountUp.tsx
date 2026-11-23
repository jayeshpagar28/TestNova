import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';

/**
 * A number that counts up from zero the first time it scrolls into view. The real value is in
 * aria-label from the first render, so a screen reader never hears the count in progress.
 */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString('en-IN'),
  delay = 0,
  duration = 1.4,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduce) {
      el.textContent = format(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (n) => (el.textContent = format(n)),
    });
    return () => controls.stop();
    // `format` is left out on purpose: it is usually an inline arrow, and a new identity on every
    // render would restart the count.
  }, [inView, value, delay, duration, reduce]);

  return (
    <span ref={ref} className={className} aria-label={format(value)}>
      {format(reduce ? value : 0)}
    </span>
  );
}
