import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bug, ExternalLink, Link2, Plus, X } from 'lucide-react';
import { DEFECT_STATUSES, api, evidenceUrl, type Defect, type DefectStatus, type ModuleTest, type Run, type RunTest } from '../../data/api';
import { EASE_OUT } from '../../theme';
import { clock, dateTimeMs, dmy } from '../../lib/format';
import { StatusBadge } from './StatusBadge';
import type { Row } from './TestTable';

const NOT_CAPTURED = 'Not captured by this test';
const NOT_RECORDED = 'Not recorded';

/** A failure in plain words, as the reports put it (server/formats.mjs failedActual). */
function failedActual(failure: RunTest['failure'], defect: Defect | null) {
  if (defect?.actual) return defect.actual;
  const real = (v?: string | null) => v != null && v !== '' && v !== 'null' && v !== 'undefined';
  if (real(failure?.actual) && real(failure?.expected)) return `The page gave ${failure!.actual} where ${failure!.expected} was expected.`;
  if (failure?.actual === 'null') return `The expected value was not found on the page${real(failure?.expected) ? ` (expected ${failure.expected})` : ''}.`;
  const check = (failure?.reason ?? failure?.message ?? '').split('\n')[0].replace(/^Error:\s*/, '').replace(/\s*\/\/.*$/, '').trim();
  return check ? `The automated check failed (${check}). The error message is below.` : NOT_CAPTURED;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-3">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-line-2';

function DefectSection({
  moduleId, testId, defect, runId, failed, canControl, seed, onChanged,
}: {
  moduleId: string;
  testId: string;
  defect: Defect | null;
  runId: string | null;
  failed: boolean;
  canControl: boolean;
  seed: { title: string; description: string };
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'none' | 'create' | 'link'>('none');
  const [title, setTitle] = useState(seed.title);
  const [description, setDescription] = useState(seed.description);
  const [priority, setPriority] = useState('High');
  const [severity, setSeverity] = useState('Major');
  const [all, setAll] = useState<Defect[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode === 'link' && !all.length) api.defects().then(setAll).catch((e) => setError(e.message));
  }, [mode, all.length]);

  const act = (work: Promise<unknown>) => {
    setError('');
    work.then(() => {
      setMode('none');
      onChanged();
    }).catch((e) => setError(e.message));
  };

  const matches = all.filter((d) => `${d.id} ${d.title}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  return (
    <section className="rounded-2xl border border-line p-4">
      <h3 className="flex items-center gap-2 text-[13.5px] text-ink"><Bug size={14} className="text-ink-2" aria-hidden /> Defect</h3>
      {defect ? (
        <div className="mt-2 text-[13px]">
          <p className="text-ink"><span className="tabular-nums">{defect.id}</span> {defect.title}</p>
          <p className="mt-1 text-[12px] text-ink-3">{defect.source}{defect.severity ? ` · Severity ${defect.severity}` : ''}{defect.priority ? ` · Priority ${defect.priority}` : ''}{defect.date ? ` · ${dmy(defect.date)}` : ''}</p>
          {(defect.description || defect.testData || defect.steps?.length) && (
            <dl className="mt-3 space-y-3">
              {defect.description && (
                <Field label="Description">
                  {[defect.description, defect.expected && `Expected: ${defect.expected}`, defect.actual && `Actual: ${defect.actual}`].filter(Boolean).join('\n\n')}
                </Field>
              )}
              {defect.testData && <Field label="Test Data / Required Info">{defect.testData}</Field>}
              {!!defect.steps?.length && (
                <Field label="Screenshot / STR">
                  {defect.steps.map((s, i) => `${i + 1}. ${s.replace(/^(\d+[.)]|[-*•])\s*/, '')}`).join('\n')}
                  {defect.evidence?.length ? `\n\nScreenshots: ${defect.evidence.map((e) => e.split(/[\\/]/).pop()).join(', ')}` : ''}
                </Field>
              )}
            </dl>
          )}
          <label className="mt-3 flex items-center gap-2 text-[12px] text-ink-2">
            Status
            {canControl ? (
              <select
                value={defect.status ?? ''}
                onChange={(e) => act(api.setDefectStatus(defect.id, e.target.value as DefectStatus))}
                className="rounded-lg border border-line bg-raised px-2 py-1 text-[12.5px] text-ink outline-none"
              >
                {!defect.status && <option value="">Not set</option>}
                {DEFECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            ) : (
              <span className="text-ink">{defect.status ?? 'Not set'}</span>
            )}
          </label>
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-ink-2">{failed ? 'This failure has no defect yet.' : 'No defect is linked to this test case.'}</p>
      )}

      {canControl && (failed || defect) && mode === 'none' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!defect && (
            <button onClick={() => setMode('create')} className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#111]">
              <Plus size={12} /> Create defect
            </button>
          )}
          <button onClick={() => setMode('link')} className="flex items-center gap-1.5 rounded-full border border-line-2 px-3.5 py-1.5 text-[12px] text-ink hover:bg-white/[0.06]">
            <Link2 size={12} /> {defect ? 'Link a different defect' : 'Link existing defect'}
          </button>
        </div>
      )}

      {mode === 'create' && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(api.createDefect({ moduleId, testId, title, description, priority, severity, runId: runId ?? '' }));
          }}
        >
          <input required value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Defect title" placeholder="Title" className={inputClass} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Defect description" rows={4} placeholder="Description" className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority" className={`${inputClass} bg-raised`}>
              {['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
            </select>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity" className={`${inputClass} bg-raised`}>
              {['Blocker', 'Critical', 'Major', 'Minor', 'Trivial'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#111]">Save defect</button>
            <button type="button" onClick={() => setMode('none')} className="rounded-full border border-line-2 px-3.5 py-1.5 text-[12px] text-ink">Cancel</button>
          </div>
        </form>
      )}

      {mode === 'link' && (
        <div className="mt-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search defects" placeholder="Search by ID or title" className={inputClass} />
          <ul className="mt-2 max-h-[220px] space-y-1 overflow-auto">
            {matches.map((d) => (
              <li key={d.id}>
                <button onClick={() => act(api.link(moduleId, testId, d.id))} className="w-full rounded-xl px-3 py-1.5 text-left text-[12.5px] text-ink hover:bg-white/[0.06]">
                  <span className="tabular-nums text-ink-2">{d.id}</span> {d.title}
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => setMode('none')} className="mt-2 rounded-full border border-line-2 px-3.5 py-1.5 text-[12px] text-ink">Cancel</button>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
    </section>
  );
}

/** A test case in full: what it is meant to do, and, when it failed, how and with what evidence. */
export function TestDetail({
  moduleId, moduleName, row, plan = null, runId, canControl, defect, onClose, onChanged,
}: {
  moduleId: string;
  moduleName?: string;
  row: Row | RunTest;
  /** The test as the module's catalogue (test plan) describes it. */
  plan?: ModuleTest | null;
  runId: string | null;
  canControl: boolean;
  defect: Defect | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [run, setRun] = useState<Run | null>(null);
  useEffect(() => {
    if (runId) api.run(runId).then(setRun).catch(() => setRun(null));
  }, [runId]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const result = run?.tests.find((t) => t.key === row.key) ?? null;
  const failure = result?.status === 'failed' ? result.failure : null;
  const failed = result?.status === 'failed';
  // the plan's fields: from the module's catalogue row when the panel opened from an execution
  const planned: Partial<ModuleTest> = { ...(plan ?? {}), ...('runId' in row ? row : {}) };
  const plannedExpected = result?.expectedResult ?? planned.expected ?? ('expectedResult' in row ? row.expectedResult : null) ?? null;
  const steps = planned.steps
    ? planned.steps.split(/\n/).map((s) => s.trim()).filter(Boolean).map((s, i) => `${i + 1}. ${s.replace(/^(\d+[.)]|[-*•])\s*/, '')}`).join('\n')
    : '';
  const status = result?.status ?? row.status;
  const actual = !result && status === 'notrun'
    ? 'Not executed yet'
    : status === 'passed' ? 'As expected'
      : status === 'failed' ? failedActual(failure, defect)
        : status === 'skipped' || status === 'blocked' ? `Not executed${result?.skipReason ? `: ${result.skipReason}` : ''}`
          : 'Not executed yet';
  const images = result?.evidence?.filter((e) => e.contentType.startsWith('image/')) ?? [];
  const files = result?.evidence?.filter((e) => !e.contentType.startsWith('image/')) ?? [];

  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-label={`${row.id} details`}
        className="fixed inset-y-3 right-3 z-50 flex w-[min(620px,calc(100vw-1.5rem))] flex-col rounded-[22px] border border-line-2 bg-panel shadow-2xl"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      >
        <header className="flex items-start gap-3 border-b border-line p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] tabular-nums text-ink-2">{row.id}</p>
            <h2 className="mt-0.5 text-[16px] leading-snug text-ink">{row.scenario}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <StatusBadge status={result?.status ?? row.status} />
              {result?.durationMs != null && <span className="text-[12px] tabular-nums text-ink-2">{clock(result.durationMs)}</span>}
              {result?.startedAt && <span className="text-[12px] text-ink-3">{dateTimeMs(result.startedAt)}</span>}
              {result?.retry ? <span className="text-[12px] text-warn">Retried {result.retry}×</span> : null}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-2 hover:text-ink"><X size={14} /></button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* the readable test case format: the same fields, in the same order, as the reports */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Test Case ID">{row.id}</Field>
            <Field label="TC Created Date">{dmy(planned.created) || NOT_RECORDED}</Field>
            {moduleName && <div className="col-span-2"><Field label="Module">{moduleName}</Field></div>}
            <div className="col-span-2"><Field label="Description">{planned.planDescription || row.description || NOT_RECORDED}</Field></div>
            <div className="col-span-2"><Field label="Test Steps / Steps to Reproduce">{steps || NOT_RECORDED}</Field></div>
            <div className="col-span-2"><Field label="Test Data">{planned.testData || NOT_RECORDED}</Field></div>
            <div className="col-span-2"><Field label="Expected Result">{planned.expected ?? plannedExpected ?? failure?.expected ?? NOT_RECORDED}</Field></div>
            <div className="col-span-2"><Field label="Actual Result">{actual}</Field></div>
          </dl>
          {failed && (
            <dl className="space-y-3 rounded-2xl border border-bad/30 bg-bad/[0.06] p-4">
              <Field label="Failure reason">{failure?.reason || NOT_CAPTURED}</Field>
              <Field label="Error message">
                <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">{failure?.message || NOT_CAPTURED}</pre>
              </Field>
            </dl>
          )}

          {(images.length > 0 || files.length > 0) && runId && (
            <section>
              <h3 className="text-[13.5px] text-ink">Execution evidence</h3>
              <div className="mt-2 flex flex-wrap gap-3">
                {images.map((e) => (
                  <a key={e.file} href={evidenceUrl(runId, e.file)} target="_blank" rel="noreferrer" title={e.name}>
                    <img src={evidenceUrl(runId, e.file)} alt={`${e.name} for ${row.id}`} className="max-h-[320px] rounded-xl border border-line" />
                  </a>
                ))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {files.map((e) => (
                  <li key={e.file}>
                    <a href={evidenceUrl(runId, e.file)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 hover:text-ink">
                      <ExternalLink size={11} aria-hidden /> {e.name}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <DefectSection
            // remount once the execution arrives, so the new-defect form starts from its failure
            key={run ? run.id : 'loading'}
            moduleId={moduleId}
            testId={row.id}
            defect={defect}
            runId={runId}
            failed={failed}
            canControl={canControl}
            seed={{
              title: `${row.id}: ${row.scenario}`,
              description: failure
                ? [
                    `Execution: ${runId}`,
                    `Expected: ${failure.expected ?? plannedExpected ?? NOT_CAPTURED}`,
                    `Actual: ${failure.actual ?? failure.reason}`,
                    '',
                    failure.message,
                  ].join('\n')
                : '',
            }}
            onChanged={onChanged}
          />
        </div>
      </motion.aside>
    </>
  );
}
