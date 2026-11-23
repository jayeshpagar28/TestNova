import { Ban, Check, Circle, CircleSlash, Clock, Loader2, X, type LucideIcon } from 'lucide-react';
import type { RunStatus, TestStatus } from '../../data/api';

/** Status always carries an icon and a word, so it never rests on colour alone. */
export const TEST_STATUS: Record<TestStatus, { label: string; icon: LucideIcon; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'var(--color-ink-2)' },
  running: { label: 'Running', icon: Loader2, color: 'var(--color-electric)' },
  passed: { label: 'Passed', icon: Check, color: 'var(--color-passed)' },
  failed: { label: 'Failed', icon: X, color: 'var(--color-failed)' },
  skipped: { label: 'Skipped', icon: CircleSlash, color: 'var(--color-ink-2)' },
  blocked: { label: 'Blocked', icon: Ban, color: 'var(--color-blocked)' },
  notrun: { label: 'Not Run', icon: Circle, color: 'var(--color-notrun)' },
};

export const RUN_STATUS: Record<RunStatus, { label: string; color: string }> = {
  running: { label: 'Running', color: 'var(--color-electric)' },
  passed: { label: 'Passed', color: 'var(--color-passed)' },
  failed: { label: 'Failed', color: 'var(--color-failed)' },
  skipped: { label: 'Nothing executed', color: 'var(--color-ink-2)' },
  stopped: { label: 'Stopped', color: 'var(--color-blocked)' },
  error: { label: 'Could not run', color: 'var(--color-failed)' },
};

export function StatusBadge({ status }: { status: TestStatus }) {
  const { label, icon: Icon, color } = TEST_STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink">
      <Icon size={13} strokeWidth={2} style={{ color }} className={status === 'running' ? 'animate-spin' : ''} aria-hidden />
      {label}
    </span>
  );
}

export function RunBadge({ status }: { status: RunStatus }) {
  const { label, color } = RUN_STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink">
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
