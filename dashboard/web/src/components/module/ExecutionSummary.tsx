import { AlertTriangle, Download, FileSpreadsheet, FileText, ScrollText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Run, RunSummary, RunTest } from '../../data/api';
import { reportUrl } from '../../data/api';
import { clock, dateTimeMs } from '../../lib/format';
import { Card, CardTitle } from '../Card';
import { RunBadge, StatusBadge } from './StatusBadge';

const METRICS: { key: keyof RunSummary['counts'] | 'defects' | 'duration'; label: string }[] = [
  { key: 'total', label: 'Total test cases' },
  { key: 'passed', label: 'Passed' },
  { key: 'failed', label: 'Failed' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'notrun', label: 'Not Run' },
  { key: 'defects', label: 'Defects' },
  { key: 'duration', label: 'Execution duration' },
];

export function ReportMenu({ run, label = 'Download Report' }: { run: RunSummary | null; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const ready = run && run.status !== 'running';
  const items = [
    { format: 'pdf' as const, label: 'Download Test Report (PDF)', icon: FileText },
    { format: 'xlsx' as const, label: 'Download Test Report (Excel)', icon: FileSpreadsheet },
    { format: 'detailed' as const, label: 'Download Detailed Execution Report', icon: ScrollText },
  ];
  return (
    <div ref={box} className="relative">
      <button
        disabled={!ready}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={ready ? `Report for ${run.id}` : 'Reports come from finished executions; this module has none yet.'}
        className="flex h-10 items-center gap-2 rounded-full border border-line-2 px-4 text-[13px] text-ink transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download size={14} /> {label}
      </button>
      {open && ready && (
        <div className="absolute right-0 z-30 mt-2 w-[290px] rounded-2xl border border-line-2 bg-raised p-1.5 shadow-2xl">
          <p className="px-3 py-1.5 text-[11px] text-ink-3">Execution {run.id}</p>
          {items.map(({ format, label: text, icon: Icon }) => (
            <a key={format} href={reportUrl(run.id, format)} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] text-ink hover:bg-white/[0.07]">
              <Icon size={14} className="text-ink-2" aria-hidden /> {text}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** One execution of this module: the latest, or whichever was picked from the history. */
export function ExecutionSummary({
  summary, run, isLatest, onLatest, onOpenTest,
}: {
  summary: RunSummary | null;
  run: Run | null;
  isLatest: boolean;
  onLatest: () => void;
  onOpenTest: (t: RunTest) => void;
}) {
  if (!summary) {
    return (
      <Card className="p-5" delay={0.3} label="Execution summary">
        <CardTitle>Execution summary</CardTitle>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-2">This module has not been executed yet, so every test case is Not Run. The summary appears after the first execution.</p>
      </Card>
    );
  }
  const c = summary.counts;
  const value = (key: (typeof METRICS)[number]['key']) => {
    if (key === 'defects') return summary.defects.length;
    if (key === 'duration') return summary.durationMs == null ? '—' : clock(summary.durationMs);
    if (key === 'skipped') return c.skipped + c.blocked;
    return c[key];
  };
  const failed = run?.tests.filter((t) => t.status === 'failed') ?? [];

  return (
    <Card className="p-5" delay={0.3} label="Execution summary">
      <CardTitle right={<RunBadge status={summary.status} />}>Execution summary</CardTitle>
      <p className="mt-1 text-[12px] text-ink-2">
        {summary.id} · {dateTimeMs(summary.startedAt)}
        {summary.scope === 'test' && ` · ${summary.target?.id} only`}
        {!isLatest && (
          <button onClick={onLatest} className="ml-2 text-lilac hover:underline">Back to latest</button>
        )}
      </p>

      {summary.lanes && summary.lanes.length > 0 && (
        <div className="mt-3" aria-label="Browsers, run in parallel">
          <p className="text-[11px] uppercase tracking-wide text-ink-3">Browsers · run in parallel</p>
          <ul className="mt-1.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(summary.lanes.length, 3)}, minmax(0, 1fr))` }}>
            {summary.lanes.map((l) => {
              const tone = l.status === 'passed' ? 'text-good' : l.status === 'failed' || l.status === 'error' ? 'text-bad' : l.status === 'unavailable' ? 'text-warn' : 'text-ink-2';
              return (
                <li key={l.browser} title={l.reason ?? undefined} className="rounded-xl border border-line-2 px-2.5 py-2">
                  <p className="text-[12.5px] capitalize text-ink">{l.browser === 'default' ? 'All browsers' : l.browser}</p>
                  <p className={`text-[11.5px] ${tone}`}>
                    {l.status === 'unavailable' ? 'Unavailable' : l.status === 'running' ? 'Running…' : l.status === 'pending' ? 'Starting…' : l.status}
                    {l.passed + l.failed > 0 && <span className="tabular-nums text-ink-2"> · {l.passed}✓ {l.failed}✗</span>}
                  </p>
                  {l.reason && <p className="mt-1 text-[11px] leading-snug text-ink-3">{l.reason}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {summary.status === 'skipped' && <p className="mt-3 text-[12.5px] text-warn">No test passed or failed: every test in this execution skipped itself.</p>}
      {summary.errors.length > 0 && (
        <div className="mt-3 rounded-2xl border border-bad/40 bg-bad/10 p-3">
          <p className="flex items-center gap-2 text-[12.5px] text-ink"><AlertTriangle size={14} className="text-bad" aria-hidden /> The execution reported an error</p>
          <pre className="mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">{summary.errors.join('\n')}</pre>
        </div>
      )}

      <dl className="mt-3 divide-y divide-line">
        {METRICS.map((m) => (
          <div key={m.key} className="flex items-center justify-between py-2 text-[13px]">
            <dt className="text-ink-2">{m.label}</dt>
            <dd className="tabular-nums text-ink">{value(m.key)}</dd>
          </div>
        ))}
      </dl>

      {failed.length > 0 && (
        <div className="mt-3">
          <h3 className="text-[12px] text-ink-2">Failures in this execution</h3>
          <ul className="mt-1.5 max-h-[220px] space-y-1 overflow-auto">
            {failed.map((t) => (
              <li key={t.key}>
                <button onClick={() => onOpenTest(t)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] hover:bg-white/[0.04]">
                  <StatusBadge status="failed" />
                  <span className="truncate text-ink-2">{t.id} {t.scenario}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
