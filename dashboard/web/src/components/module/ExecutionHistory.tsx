import { Download, FileSpreadsheet } from 'lucide-react';
import type { RunSummary } from '../../data/api';
import { reportUrl } from '../../data/api';
import { clock, dateTimeMs } from '../../lib/format';
import { Card, CardTitle } from '../Card';
import { RunBadge } from './StatusBadge';

export function ExecutionHistory({ runs, selected, onSelect }: { runs: RunSummary[]; selected: string | null; onSelect: (id: string) => void }) {
  const done = runs.filter((r) => r.status !== 'running');
  return (
    <Card className="p-5" delay={0.4} label="Execution history">
      <CardTitle right={<span className="text-[12px] text-ink-3">{done.length}</span>}>Execution history</CardTitle>
      {!done.length && <p className="mt-4 text-[13px] text-ink-2">No executions recorded for this module.</p>}
      <ul className="mt-3 max-h-[420px] space-y-2 overflow-auto">
        {done.map((r) => (
          <li key={r.id} className={`rounded-2xl border p-3 transition-colors ${selected === r.id ? 'border-lilac/50 bg-white/[0.04]' : 'border-line'}`}>
            <button onClick={() => onSelect(r.id)} className="block w-full text-left" title="View this execution's report">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] tabular-nums text-ink">{dateTimeMs(r.startedAt)}</span>
                <RunBadge status={r.status} />
              </div>
              <p className="mt-0.5 text-[11px] tabular-nums text-ink-3">{r.id}{r.scope === 'test' ? ` · ${r.target?.id} only` : ''}</p>
              <p className="mt-1.5 text-[12px] tabular-nums text-ink-2">
                {r.counts.passed} passed · {r.counts.failed} failed · {r.counts.skipped + r.counts.blocked} skipped · {r.durationMs == null ? '—' : clock(r.durationMs)}
              </p>
              {r.defects.length > 0 && <p className="mt-1 truncate text-[11.5px] text-ink-3">Defects: {r.defects.join(', ')}</p>}
            </button>
            <div className="mt-2 flex gap-3 text-[11.5px]">
              <a href={reportUrl(r.id, 'pdf')} className="flex items-center gap-1 text-ink-2 hover:text-ink"><Download size={11} aria-hidden /> PDF</a>
              <a href={reportUrl(r.id, 'xlsx')} className="flex items-center gap-1 text-ink-2 hover:text-ink"><FileSpreadsheet size={11} aria-hidden /> Excel</a>
              <a href={reportUrl(r.id, 'detailed')} className="flex items-center gap-1 text-ink-2 hover:text-ink"><Download size={11} aria-hidden /> Detailed</a>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
