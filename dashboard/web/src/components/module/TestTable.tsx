import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import type { ModuleTest, Run, TestStatus } from '../../data/api';
import { clock } from '../../lib/format';
import { Card, Chips } from '../Card';
import { StatusBadge } from './StatusBadge';

type Filter = 'all' | 'passed' | 'failed' | 'notrun' | 'blocked' | 'skipped';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'notrun', label: 'Not Run' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'skipped', label: 'Skipped' },
];

export interface Row extends Omit<ModuleTest, 'status' | 'durationMs'> {
  status: TestStatus;
  durationMs: number | null;
}

/** While an execution is live its rows replace the stored status of the tests it covers. */
export function mergeLive(tests: ModuleTest[], active: Run | null): Row[] {
  if (!active) return tests;
  return tests.map((t) => {
    const live = active.tests.find((r) => r.key === t.key);
    if (!live || (live.status === 'notrun' && active.scope === 'test')) return t;
    return { ...t, status: live.status, durationMs: live.durationMs ?? null };
  });
}

export function TestTable({
  rows, currentKey, canRun, running, onRun, onOpen,
}: {
  rows: Row[];
  currentKey: string | null;
  canRun: boolean;
  running: boolean;
  onRun: (key: string) => void;
  onOpen: (row: Row) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const list = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLTableRowElement>(null);

  const tally = useMemo(() => {
    const n = { all: rows.length, passed: 0, failed: 0, notrun: 0, blocked: 0, skipped: 0 };
    for (const r of rows) if (r.status in n) n[r.status as Filter] += 1;
    return n;
  }, [rows]);
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  // Keep the running test in view inside the list, without moving the page itself.
  useEffect(() => {
    const box = list.current;
    const row = current.current;
    if (!box || !row) return;
    box.scrollTo({ top: row.offsetTop - box.clientHeight / 2, behavior: 'smooth' });
  }, [currentKey]);

  return (
    <Card className="flex flex-col p-5" delay={0.2} label="Module test cases">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium tracking-wide text-ink">Test cases</h2>
        <div className="no-scrollbar max-w-full overflow-x-auto">
          <Chips label="Filter test cases" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: `${f.label} ${tally[f.value]}` }))} />
        </div>
      </div>
      <div ref={list} className="relative mt-4 max-h-[640px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-card text-[11px] uppercase tracking-[0.06em] text-ink-3">
            <tr>
              <th className="w-[88px] border-b border-line py-2 pr-3 font-normal sm:w-[112px]">Test case ID</th>
              <th className="border-b border-line py-2 pr-3 font-normal">Test case name</th>
              <th className="hidden w-[30%] border-b border-line py-2 pr-3 font-normal xl:table-cell">Description</th>
              <th className="hidden w-[78px] border-b border-line py-2 pr-3 font-normal sm:table-cell">Priority</th>
              <th className="w-[92px] border-b border-line py-2 pr-2 font-normal sm:w-[104px]">Status</th>
              <th className="w-[44px] border-b border-line py-2 font-normal sm:w-[64px]"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const live = r.key === currentKey;
              return (
                <tr
                  key={r.key}
                  ref={live ? current : undefined}
                  onClick={() => onOpen(r)}
                  aria-current={live ? 'true' : undefined}
                  className={`group cursor-pointer transition-colors ${live ? 'bg-electric/15 shadow-[inset_2px_0_0_var(--color-electric)]' : 'hover:bg-white/[0.03]'}`}
                >
                  <td className="whitespace-nowrap border-b border-line py-2.5 pl-1 pr-3 align-top tabular-nums text-ink-2">
                    {r.id}
                    {r.idGenerated && <span className="block text-[10px] text-ink-3" title="This test has no TC id in its title">no TC id</span>}
                  </td>
                  <td className="border-b border-line py-2.5 pr-3 align-top text-ink">{r.scenario}</td>
                  <td className="hidden border-b border-line py-2.5 pr-3 align-top text-ink-2 xl:table-cell">{r.description || r.expected || <span className="text-ink-3">—</span>}</td>
                  <td className="hidden border-b border-line py-2.5 pr-3 align-top text-ink-2 sm:table-cell">{r.priority ?? <span className="text-ink-3" title="No priority in the test plan">—</span>}</td>
                  <td className="border-b border-line py-2.5 pr-2 align-top">
                    <StatusBadge status={r.status} />
                    {r.durationMs != null && r.status !== 'running' && <span className="block text-[11px] tabular-nums text-ink-3">{clock(r.durationMs)}</span>}
                  </td>
                  <td className="border-b border-line py-2 align-top">
                    <div className="flex items-center justify-end gap-1">
                      {canRun && (
                        <button
                          disabled={running}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRun(r.key);
                          }}
                          aria-label={`Run ${r.id}`}
                          title={running ? 'An execution is in progress' : `Run ${r.id} only`}
                          className="grid size-7 place-items-center rounded-full border border-line text-ink-2 transition hover:border-line-2 hover:text-ink disabled:opacity-30"
                        >
                          <Play size={11} fill="currentColor" />
                        </button>
                      )}
                      <ChevronRight size={14} className="hidden text-ink-3 sm:block" aria-hidden />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <p className="py-10 text-center text-[13px] text-ink-3">No test cases have this status.</p>}
      </div>
    </Card>
  );
}
