import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, ArrowLeft, Bug, ChevronDown, FileSpreadsheet, FileText, Info, Menu, X } from 'lucide-react';
import { api } from '../../data/api';
import { DEFECT_STATUSES, downloadUrl, evidenceSrc, reportApi, type DefectStatus, type Evidence, type Failure, type QaReport, type RegisterDefect, type Tone } from '../../data/report';
import { goDashboard, goModule, goReport, type ReportTab } from '../../lib/router';
import { EASE_OUT } from '../../theme';
import { Card, CardTitle } from '../Card';
import { ProjectName } from '../ProjectName';
import { ThemeToggle } from '../ThemeToggle';

/**
 * The QA report on the dashboard: the same model as the PDF and Excel downloads (the fingerprint in
 * the header matches theirs). Every count opens the detail behind it: a module opens its page, a
 * defect count opens the register filtered to it, a failed count opens the failed test cases.
 */

// ── the status colours: green passed, red failed, orange pending, grey not executed, blue info ──
const TONE: Record<Tone, string> = {
  green: 'border-good/35 bg-good/10 text-good',
  red: 'border-bad/35 bg-bad/10 text-bad',
  orange: 'border-warn/35 bg-warn/10 text-warn',
  grey: 'border-line-2 bg-white/[0.04] text-ink-3',
  blue: 'border-electric/35 bg-electric/10 text-electric',
};
export function toneOf(value: string): Tone {
  if (/^(Passed|Resolved|Closed|Completed – all)/.test(value)) return 'green';
  if (/^(Failed|Open|Reopened|Not ready|Completed – issues|Partially executed – issues|P0|Critical)/.test(value)) return 'red';
  if (/^(In Progress|Retest|Pending|Conditional|Release only|Partially executed – no|Passed with gaps|Skipped|P1|High)/.test(value)) return 'orange';
  if (/^(Not Executed|Not Provided|Not resolved|Coverage Not|Evidence Not|Testing not)/.test(value)) return 'grey';
  return 'blue';
}
function Badge({ value, tone }: { value: string; tone?: Tone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-medium ${TONE[tone ?? toneOf(value)]}`}>{value}</span>;
}
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : 'Not Provided');

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'defects', label: 'Defect register' },
  { id: 'failed', label: 'Failed test cases' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'validation', label: 'History & validation' },
];

export function ReportPage({ tab, params, onMenu }: { tab: ReportTab; params: URLSearchParams; onMenu: () => void }) {
  const [report, setReport] = useState<QaReport | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const load = useCallback(() => {
    reportApi.report().then((r) => {
      setReport(r);
      setError('');
    }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    api.status().then((s) => setCanEdit(s.canControl)).catch(() => setCanEdit(false));
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onMenu} aria-label="Open navigation" className="grid size-9 place-items-center rounded-full border border-line text-ink-2 lg:hidden"><Menu size={16} /></button>
          <button onClick={goDashboard} className="flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Dashboard</button>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-light leading-tight tracking-[-0.01em] text-ink sm:text-[36px]">QA Report<ProjectName /></h1>
            {report && (
              <p className="mt-1 text-[12.5px] text-ink-2">
                {report.meta.reportId} · generated {when(report.meta.generatedAt)} · <span title="The PDF and Excel downloads show the same fingerprint when they come from the same data">fingerprint {report.meta.fingerprint}</span>
              </p>
            )}
          </div>
          <Downloads ready={Boolean(report)} />
        </div>
        <nav aria-label="Report sections" className="flex flex-wrap gap-1 rounded-full border border-line bg-white/[0.02] p-1 self-start">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => goReport(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={`h-8 rounded-full px-3.5 text-[12.5px] transition-colors ${tab === t.id ? 'border border-lilac/50 bg-white/[0.07] text-ink' : 'text-ink-3 hover:text-ink-2'}`}>
              {t.label}
            </button>
          ))}
        </nav>
        {error && <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/10 px-4 py-2 text-[13px] text-ink">{error}</p>}
      </motion.header>

      {report === undefined && !error && <p className="py-20 text-center text-[13px] text-ink-3">Building the report from the executions…</p>}
      {report === null && <Card className="p-8 text-center text-[13px] text-ink-2">No module of this project has been executed yet, so there is nothing to report.</Card>}
      {report && (
        <>
          <ValidationBanner report={report} />
          {tab === 'overview' && <Overview r={report} />}
          {tab === 'defects' && <Register r={report} params={params} canEdit={canEdit} onChanged={load} />}
          {tab === 'failed' && <FailedTests r={report} params={params} />}
          {tab === 'accessibility' && <Accessibility r={report} />}
          {tab === 'validation' && <HistoryAndValidation r={report} />}
        </>
      )}
    </div>
  );
}

function Downloads({ ready }: { ready: boolean }) {
  const link = 'flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-2 hover:text-ink aria-disabled:pointer-events-none aria-disabled:opacity-50';
  return (
    <div className="flex flex-wrap gap-2">
      <a className={link} aria-disabled={!ready} href={downloadUrl('pdf')}><FileText size={13} aria-hidden /> PDF report</a>
      <a className={link} aria-disabled={!ready} href={downloadUrl('xlsx')}><FileSpreadsheet size={13} aria-hidden /> Excel workbook</a>
      <a className={link} aria-disabled={!ready} href={downloadUrl('defects')}><Bug size={13} aria-hidden /> Defect register</a>
    </div>
  );
}

function ValidationBanner({ report }: { report: QaReport }) {
  const issues = report.validation.filter((v) => v.level !== 'info');
  if (!issues.length) return null;
  const errors = issues.filter((v) => v.level === 'error').length;
  return (
    <button onClick={() => goReport('validation')} className={`flex items-start gap-2.5 rounded-2xl border px-4 py-2.5 text-left text-[12.5px] text-ink ${errors ? 'border-bad/40 bg-bad/10' : 'border-warn/40 bg-warn/10'}`}>
      <AlertTriangle size={15} className={`mt-px shrink-0 ${errors ? 'text-bad' : 'text-warn'}`} aria-hidden />
      <span>
        <b>Data validation found {issues.length} issue{issues.length === 1 ? '' : 's'}</b> in the records behind this report{errors ? ` (${errors} error${errors === 1 ? '' : 's'})` : ''}. The figures use the per-test results; nothing was corrected silently. <span className="underline">See each issue and its source.</span>
      </span>
    </button>
  );
}

// ── overview ─────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: string; tone?: Tone; onClick?: () => void }) {
  const color = tone ? { green: 'text-good', red: 'text-bad', orange: 'text-warn', grey: 'text-ink-3', blue: 'text-electric' }[tone] : 'text-ink';
  const body = (
    <>
      <span className={`block text-[26px] font-light tabular-nums leading-tight ${color}`}>{value}</span>
      <span className="block text-[12px] text-ink-2">{label}</span>
      {sub && <span className="block text-[11px] text-ink-3">{sub}</span>}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="rounded-2xl border border-line bg-card p-4 text-left transition-colors hover:border-line-2 hover:bg-white/[0.03]">{body}</button>
  ) : (
    <div className="rounded-2xl border border-line bg-card p-4">{body}</div>
  );
}

/** Passed / failed / skipped / not executed as one bar, each part labelled on hover and in the legend. */
function OutcomeBar({ c }: { c: { total: number; passed: number; failed: number; skipped: number; notExecuted: number } }) {
  const parts = [
    { k: 'Passed', n: c.passed, cls: 'bg-good' }, { k: 'Failed', n: c.failed, cls: 'bg-bad' },
    { k: 'Skipped', n: c.skipped, cls: 'bg-warn' }, { k: 'Not executed', n: c.notExecuted, cls: 'bg-ink-3' },
  ];
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.n} ${p.k.toLowerCase()}`).join(', ')}>
        {parts.filter((p) => p.n).map((p) => <span key={p.k} title={`${p.k}: ${p.n} of ${c.total}`} className={`${p.cls} h-full first:rounded-l-full last:rounded-r-full`} style={{ width: `${(p.n / (c.total || 1)) * 100}%` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-2">
        {parts.map((p) => <span key={p.k} className="flex items-center gap-1.5"><i className={`inline-block size-2.5 rounded-sm ${p.cls}`} aria-hidden />{p.k} <span className="tabular-nums text-ink">{p.n}</span></span>)}
      </div>
    </div>
  );
}

/** One distribution (defects by priority, severity, status, module): one hue, values in text. */
function Distribution({ title, rows, onPick }: { title: string; rows: { label: string; n: number; filter: Record<string, string> }[]; onPick: (f: Record<string, string>) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <Card className="p-5">
      <CardTitle>{title}</CardTitle>
      {rows.length ? (
        <ul className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <li key={r.label}>
              <button onClick={() => onPick(r.filter)} title={`${r.label}: ${r.n} defect${r.n === 1 ? '' : 's'} (open the register filtered to it)`} className="group grid w-full grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-white/[0.04]">
                <span className="truncate text-[12px] text-ink-2 group-hover:text-ink">{r.label}</span>
                <span className="h-2.5 rounded-r-[4px] bg-lilac/70" style={{ width: `${Math.max(2, (r.n / max) * 100)}%` }} aria-hidden />
                <span className="text-right text-[12px] tabular-nums text-ink">{r.n}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-[12.5px] text-ink-3">No defects.</p>}
    </Card>
  );
}

function Overview({ r }: { r: QaReport }) {
  const t = r.totals;
  const count = (key: (d: QaReport['register'][number]) => string, order: string[]) => {
    const m = new Map<string, number>();
    for (const d of r.register) m.set(key(d), (m.get(key(d)) ?? 0) + 1);
    return [...order.filter((k) => m.has(k)), ...[...m.keys()].filter((k) => !order.includes(k))].map((k) => [k, m.get(k) ?? 0] as const);
  };
  const toDefects = (f: Record<string, string>) => goReport('defects', f);
  return (
    <>
      <Card className="p-5" glow>
        <div className="flex flex-wrap items-center gap-2">
          <Badge value={r.overall.label} tone={r.overall.tone} />
          <Badge value={r.recommendation.verdict} tone={r.recommendation.tone} />
        </div>
        <p className="mt-3 max-w-[110ch] text-[14px] leading-relaxed text-ink">{r.summary}</p>
        <p className="mt-2 max-w-[110ch] text-[12.5px] text-ink-2">{r.recommendation.text}</p>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['Application URL', r.meta.project.url], ['Environment', r.meta.project.environment], ['Version / build', r.meta.build],
            ['Browser', r.meta.browsers.map((b) => `${b.name} ${b.version ?? '(version not recorded)'}`).join(', ') || 'Not Provided'],
            ['Executed', `${when(r.meta.executionStart)} – ${when(r.meta.executionEnd)}`], ['Executions', r.meta.suite],
          ].map(([k, v]) => <div key={k} className="flex gap-2"><dt className="shrink-0 text-ink-3">{k}</dt><dd className="min-w-0 truncate text-ink-2" title={v}>{v}</dd></div>)}
        </dl>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Test cases" value={t.total} sub={`${t.modulesExecuted} of ${t.modules} modules`} />
        <Stat label="Passed" value={t.passed} sub={pct(t.passPct)} tone="green" />
        <Stat label="Failed" value={t.failed} sub={pct(t.failPct)} tone="red" onClick={() => goReport('failed')} />
        <Stat label="Skipped" value={t.skipped} tone="orange" />
        <Stat label="Not executed" value={t.notExecuted} tone="grey" />
        <Stat label="Unique defects" value={t.uniqueDefects} sub={`${t.openDefects} open`} tone="blue" onClick={() => goReport('defects')} />
        <Stat label="Open defects" value={t.openDefects} tone={t.openDefects ? 'red' : 'green'} onClick={() => goReport('defects', { status: 'open' })} />
        <Stat label="Failures not linked" value={t.failedUnlinked} sub="need QA investigation" tone={t.failedUnlinked ? 'red' : 'green'} onClick={() => goReport('failed', { unlinked: '1' })} />
      </div>

      <Card className="p-5">
        <CardTitle right={<span className="text-[11.5px] text-ink-3">{r.meta.definitions.passPct}</span>}>Module-wise summary</CardTitle>
        <div className="mt-3"><OutcomeBar c={t} /></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <caption className="sr-only">Test results per module</caption>
            <thead><tr className="border-b border-line text-left text-[11.5px] text-ink-3">
              {['Module', 'Total', 'Passed', 'Failed', 'Skipped', 'Not executed', 'Pass %', 'Defects', 'Status'].map((h, i) => <th key={h} scope="col" className={`py-2 pr-3 font-normal ${i && i < 8 ? 'text-right' : ''}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {r.modules.map((m) => (
                <tr key={m.id} className="border-b border-line/60">
                  <th scope="row" className="py-2 pr-3 text-left font-normal"><button onClick={() => goModule(m.id)} className="text-ink hover:text-lilac hover:underline">{m.name}</button></th>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.total}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-good">{m.passed}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.failed ? <button onClick={() => goReport('failed', { module: m.id })} aria-label={`${m.failed} failed test cases in ${m.name}`} title="Open the failed test cases" className="text-bad hover:underline">{m.failed}</button> : 0}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.skipped}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.notExecuted}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(m.passPct)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.defectIds.length ? <button onClick={() => goReport('defects', { affects: m.id })} aria-label={`${m.defectIds.length} defects in ${m.name}`} title="Open the defect register for this module" className="text-electric hover:underline">{m.defectIds.length}</button> : 0}</td>
                  <td className="py-2"><Badge value={m.status.label} tone={m.status.tone} /></td>
                </tr>
              ))}
              <tr className="font-medium">
                <th scope="row" className="py-2 pr-3 text-left">All modules</th>
                <td className="py-2 pr-3 text-right tabular-nums">{t.total}</td><td className="py-2 pr-3 text-right tabular-nums">{t.passed}</td><td className="py-2 pr-3 text-right tabular-nums">{t.failed}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{t.skipped}</td><td className="py-2 pr-3 text-right tabular-nums">{t.notExecuted}</td><td className="py-2 pr-3 text-right tabular-nums">{pct(t.passPct)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{t.defectsLinkedToFailures}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">Defects are unique per module; a defect that affects several modules counts in each, so the column can add up to more than the {t.defectsLinkedToFailures} unique defects behind all failures. {r.meta.definitions.defects}</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Distribution title="Open defects by priority" rows={count((d) => d.priority.value, ['P0', 'P1', 'P2', 'P3']).filter(([k]) => r.register.some((d) => d.open && d.priority.value === k)).map(([k]) => ({ label: k, n: r.register.filter((d) => d.open && d.priority.value === k).length, filter: { priority: k, status: 'open' } }))} onPick={toDefects} />
        <Distribution title="Defects by severity" rows={count((d) => d.severity.value, ['Critical', 'High', 'Medium', 'Low']).map(([k, n]) => ({ label: k, n, filter: { severity: k } }))} onPick={toDefects} />
        <Distribution title="Open vs resolved" rows={[
          { label: 'Open', n: r.register.filter((d) => d.open).length, filter: { status: 'open' } },
          { label: 'Resolved / closed', n: r.register.filter((d) => d.status === 'Resolved' || d.status === 'Closed').length, filter: { status: 'resolved' } },
        ]} onPick={toDefects} />
        <Distribution title="Defects by module" rows={r.modules.map((m) => ({ label: m.name, n: r.register.filter((d) => d.moduleId === m.id).length, filter: { module: m.id } })).filter((x) => x.n)} onPick={toDefects} />
      </div>

      <Card className="p-5">
        <CardTitle>QA observations</CardTitle>
        <div className="mt-3 grid grid-cols-1 gap-5 text-[12.5px] lg:grid-cols-3">
          <div>
            <h3 className="mb-1.5 text-[12px] text-ink-3">Major open issues</h3>
            {r.observations.majorIssues.length ? (
              <ul className="space-y-1">{r.observations.majorIssues.map((d) => (
                <li key={d.id}><button onClick={() => goReport('defects', { id: d.id })} className="text-left hover:underline"><span className="text-ink">{d.id}</span> <span className="text-ink-2">{d.title}</span></button> <Badge value={d.priority} /> <Badge value={d.severity} /></li>
              ))}</ul>
            ) : <p className="text-ink-3">None.</p>}
          </div>
          <div>
            <h3 className="mb-1.5 text-[12px] text-ink-3">Modules requiring attention</h3>
            <ul className="space-y-1">{r.observations.modulesNeedingAttention.map((m) => <li key={m.id}><button onClick={() => goModule(m.id)} className="text-ink hover:underline">{m.name}</button> <span className="text-ink-2">{m.reason}</span></li>)}</ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-[12px] text-ink-3">Why this recommendation</h3>
            <ul className="list-disc space-y-1 pl-4 text-ink-2">{r.recommendation.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
            {r.observations.additionalTesting.length > 0 && (
              <>
                <h3 className="mb-1.5 mt-3 text-[12px] text-ink-3">Further testing needed</h3>
                <ul className="list-disc space-y-1 pl-4 text-ink-2">{r.observations.additionalTesting.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}

// ── evidence ─────────────────────────────────────────────────────────────────
function EvidenceList({ items }: { items: Evidence[] }) {
  const shots = items.filter((e) => e.kind === 'image' && e.figure);
  const others = items.length - shots.length;
  if (!items.length) return <p className="text-[12.5px] text-ink-3">Evidence Not Available.</p>;
  return (
    <div className="space-y-3">
      {shots.map((e, i) => {
        const src = evidenceSrc(e.file);
        return (
          <figure key={`${i}-${e.file}`}>
            {src ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={e.caption} loading="lazy" className="w-full rounded-lg border border-line" /></a> : null}
            <figcaption className="mt-1 text-[11.5px] text-ink-2"><b className="text-ink">Figure {e.figure}.</b> {e.caption}</figcaption>
          </figure>
        );
      })}
      {others > 0 && (
        <details className="text-[12px] text-ink-2">
          <summary className="cursor-pointer text-ink-3">{others} more file{others === 1 ? '' : 's'}: earlier attempts, screen recordings, logs</summary>
          <ul className="mt-1.5 space-y-1">{items.filter((e) => !(e.kind === 'image' && e.figure)).map((e, i) => {
            const src = evidenceSrc(e.file);
            return <li key={`${i}-${e.file}`}>{src ? <a href={src} target="_blank" rel="noreferrer" className="text-electric hover:underline">{e.caption}</a> : e.caption}</li>;
          })}</ul>
        </details>
      )}
    </div>
  );
}

// ── defect register ──────────────────────────────────────────────────────────
const Field = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="grid grid-cols-[9.5rem_1fr] gap-3 border-b border-line/60 py-1.5 text-[12.5px]">
    <dt className="text-ink-3">{k}</dt><dd className="min-w-0 whitespace-pre-wrap break-words text-ink">{children}</dd>
  </div>
);

function classText(c: RegisterDefect['priority']) {
  const notes = [c.provisional ? 'proposed by the automated analysis' : null, !c.standard && c.recorded ? `recorded as ${c.recorded}` : null].filter(Boolean);
  return <><Badge value={c.value} />{notes.length ? <span className="ml-1.5 text-[11px] text-ink-3">({notes.join('; ')})</span> : null}</>;
}

function Register({ r, params, canEdit, onChanged }: { r: QaReport; params: URLSearchParams; canEdit: boolean; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const filter = { module: params.get('module') ?? '', affects: params.get('affects') ?? '', status: params.get('status') ?? '', priority: params.get('priority') ?? '', severity: params.get('severity') ?? '' };
  const openId = params.get('id');
  const setFilter = (k: string, v: string) => goReport('defects', { ...filter, [k]: v });
  // "affects": the defects behind a module's failures (what its Defects count shows), wherever they were raised
  const affected = r.modules.find((m) => m.id === filter.affects);
  const rows = useMemo(() => r.register.filter((d) =>
    (!filter.module || d.moduleId === filter.module)
    && (!affected || affected.defectIds.includes(d.id))
    && (!filter.status || (filter.status === 'open' ? d.open : filter.status === 'resolved' ? d.status === 'Resolved' || d.status === 'Closed' : d.status === filter.status))
    && (!filter.priority || d.priority.value === filter.priority)
    && (!filter.severity || d.severity.value === filter.severity)
    && (!q || `${d.id} ${d.aliases.join(' ')} ${d.title} ${d.tests.join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [r, filter.module, filter.status, filter.priority, filter.severity, affected, q]);
  const open = r.register.find((d) => d.id === openId) ?? null;
  const select = (label: string, k: keyof typeof filter, options: [string, string][]) => (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-3">{label}
      <select value={filter[k]} onChange={(e) => setFilter(k, e.target.value)} className="h-8 rounded-full border border-line bg-card px-2.5 text-[12px] text-ink">
        <option value="">All</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_520px]">
      <Card className="p-5">
        <CardTitle right={<span className="text-[12px] text-ink-3">{rows.length} of {r.register.length}</span>}>Consolidated defect register</CardTitle>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {select('Module', 'module', r.modules.map((m) => [m.id, m.name]))}
          {select('Status', 'status', [['open', 'All open'], ['resolved', 'Resolved / closed'], ...DEFECT_STATUSES.map((s) => [s, s] as [string, string])])}
          {select('Priority', 'priority', ['P0', 'P1', 'P2', 'P3', 'Pending QA Classification'].map((p) => [p, p]))}
          {select('Severity', 'severity', ['Critical', 'High', 'Medium', 'Low', 'Pending QA Classification'].map((p) => [p, p]))}
          {affected && (
            <button onClick={() => setFilter('affects', '')} className="flex h-8 items-center gap-1.5 rounded-full border border-electric/40 bg-electric/10 px-3 text-[12px] text-ink">
              Behind the failures in {affected.name} <X size={12} aria-label="Clear" />
            </button>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id, title, test case" aria-label="Search defects" className="h-8 min-w-[220px] flex-1 rounded-full border border-line bg-card px-3 text-[12px] text-ink placeholder:text-ink-3" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <caption className="sr-only">Defects</caption>
            <thead><tr className="border-b border-line text-left text-[11.5px] text-ink-3">
              {['Defect', 'Module', 'Title', 'Status', 'Priority', 'Severity', 'Type', 'Failing tests'].map((h) => <th key={h} scope="col" className="py-2 pr-3 font-normal">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className={`cursor-pointer border-b border-line/60 hover:bg-white/[0.03] ${open?.id === d.id ? 'bg-white/[0.05]' : ''}`} onClick={() => goReport('defects', { ...filter, id: d.id })}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <button className="whitespace-nowrap text-ink hover:underline" onClick={(e) => { e.stopPropagation(); goReport('defects', { ...filter, id: d.id }); }}>{d.id}</button>
                    {d.aliases.length > 0 && <span className="block text-[10.5px] text-ink-3">{d.aliases.join(', ')}</span>}
                  </th>
                  <td className="py-2 pr-3 text-ink-2">{d.module}</td>
                  <td className="py-2 pr-3 text-ink">{d.title}{d.flags.length > 0 && <AlertTriangle size={12} className="ml-1 inline text-warn" aria-label="Needs attention" />}</td>
                  <td className="py-2 pr-3"><Badge value={d.status} /></td>
                  <td className="py-2 pr-3"><Badge value={d.priority.value} /></td>
                  <td className="py-2 pr-3"><Badge value={d.severity.value} /></td>
                  <td className="py-2 pr-3 text-ink-2">{d.type}</td>
                  <td className="py-2 text-[11.5px] text-ink-2">{d.failingTests.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="py-6 text-center text-[12.5px] text-ink-3">No defect matches these filters.</p>}
        </div>
      </Card>
      {open && <DefectPanel d={open} canEdit={canEdit} onClose={() => goReport('defects', filter)} onChanged={onChanged} />}
    </div>
  );
}

const EDITABLE: { key: string; label: string; multiline?: boolean; options?: string[] }[] = [
  { key: 'developer', label: 'Developer assigned' },
  { key: 'resolvedDate', label: 'Resolved date (YYYY-MM-DD)' },
  { key: 'priority', label: 'Priority', options: ['', 'P0', 'P1', 'P2', 'P3'] },
  { key: 'severity', label: 'Severity', options: ['', 'Critical', 'High', 'Medium', 'Low'] },
  { key: 'type', label: 'Type', options: ['', 'Functional', 'UI', 'Navigation', 'Accessibility', 'Performance', 'Security', 'Validation', 'Compatibility', 'Integration', 'API'] },
  { key: 'store', label: 'Store' },
  { key: 'instance', label: 'Instance' },
  { key: 'devComment', label: 'Developer comment', multiline: true },
  { key: 'qaComment', label: 'QA comment', multiline: true },
  { key: 'changes', label: 'Changes applied', multiline: true },
];
const PLACEHOLDER = /^(Pending Update|Pending QA Classification|Not Provided|Not resolved yet)$/;

function DefectPanel({ d, canEdit, onClose, onChanged }: { d: RegisterDefect; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const initial = (key: string) => {
    const v = key === 'priority' ? (d.priority.pending ? '' : d.priority.value) : key === 'severity' ? (d.severity.pending ? '' : d.severity.value) : String((d as unknown as Record<string, unknown>)[key] ?? '');
    if (key === 'resolvedDate' && v && !PLACEHOLDER.test(v)) {
      const m = v.match(/^(\d{2})-(\w{3})-(\d{4})$/);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return m ? `${m[3]}-${String(months.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1]}` : v;
    }
    return PLACEHOLDER.test(v) ? '' : v;
  };
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    setForm(Object.fromEntries(EDITABLE.map((f) => [f.key, initial(f.key)])));
    setEditing(false);
    setMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

  const setStatus = async (status: DefectStatus) => {
    setBusy(true);
    try {
      await reportApi.setStatus(d.id, status);
      setMsg(`Status set to ${status}.`);
      onChanged();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const { changed } = await reportApi.setFields(d.id, form);
      setMsg(changed.length ? `Saved: ${changed.length} field${changed.length === 1 ? '' : 's'} changed.` : 'Nothing changed.');
      setEditing(false);
      onChanged();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-2rem)] 2xl:overflow-y-auto" label={`Defect ${d.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11.5px] text-ink-3">{d.id}{d.aliases.length ? ` · earlier id ${d.aliases.join(', ')}` : ''}</p>
          <h2 className="mt-0.5 text-[16px] font-medium text-ink">{d.title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close defect" className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-2 hover:text-ink"><X size={14} /></button>
      </div>
      {d.flags.map((f, i) => <p key={i} className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-ink">{f}</p>)}

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-ink-3">Status
            <select disabled={busy} value={d.statusKnown ? d.status : ''} onChange={(e) => setStatus(e.target.value as DefectStatus)} className="h-8 rounded-full border border-line bg-card px-2.5 text-[12px] text-ink">
              {!d.statusKnown && <option value="">{d.status}</option>}
              {DEFECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <button disabled={busy} onClick={() => setEditing((x) => !x)} className="h-8 rounded-full border border-line px-3 text-[12px] text-ink-2 hover:text-ink">{editing ? 'Cancel editing' : 'Edit details'}</button>
          {msg && <span role="status" className="text-[12px] text-ink-2">{msg}</span>}
        </div>
      )}

      {editing ? (
        <form className="mt-4 space-y-2.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {EDITABLE.map((f) => (
            <label key={f.key} className="block text-[12px] text-ink-3">{f.label}
              {f.options ? (
                <select value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="mt-1 block h-9 w-full rounded-xl border border-line bg-card px-2.5 text-[12.5px] text-ink">
                  {f.options.map((o) => <option key={o} value={o}>{o || 'Pending QA Classification'}</option>)}
                </select>
              ) : f.multiline ? (
                <textarea value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} rows={3} className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2 text-[12.5px] text-ink" />
              ) : (
                <input value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="mt-1 block h-9 w-full rounded-xl border border-line bg-card px-3 text-[12.5px] text-ink" />
              )}
            </label>
          ))}
          <button type="submit" disabled={busy} className="h-9 rounded-full bg-white px-5 text-[12.5px] font-medium text-[#111] disabled:opacity-50">Save</button>
        </form>
      ) : (
        <dl className="mt-4">
          <Field k="Date reported">{d.dateReported}</Field>
          <Field k="Store">{d.store}</Field>
          <Field k="Instance">{d.instance}</Field>
          <Field k="Module">{d.module}</Field>
          <Field k="Description">{d.description}</Field>
          <Field k="Test data">{d.testData}</Field>
          <Field k="Steps to reproduce">{d.steps}</Field>
          <Field k="Expected result">{d.expected}</Field>
          <Field k="Actual result">{d.actual}</Field>
          <Field k="Status"><Badge value={d.status} /></Field>
          <Field k="Priority">{classText(d.priority)}</Field>
          <Field k="Severity">{classText(d.severity)}</Field>
          <Field k="Type">{d.type}</Field>
          <Field k="Developer assigned">{d.developer}</Field>
          <Field k="Resolved date">{d.resolvedDate}</Field>
          <Field k="Developer comment">{d.devComment}</Field>
          <Field k="QA comment">{d.qaComment}</Field>
          <Field k="Changes applied">{d.changes}</Field>
          <Field k="Test cases">{d.tests.length ? d.tests.map((tc) => <button key={tc} onClick={() => goReport('failed', { test: tc })} className="mr-2 text-electric hover:underline">{tc}</button>) : '—'}</Field>
          {d.history.length > 0 && (
            <Field k="Status history">{d.history.map((h, i) => <span key={i} className="block text-ink-2">{new Date(h.at).toLocaleDateString('en-GB')}: {h.to ? `${h.from ?? '—'} → ${h.to}` : `updated ${h.fields?.join(', ')}`} ({h.by}){h.note ? ` · ${h.note}` : ''}</span>)}</Field>
          )}
        </dl>
      )}
      <h3 className="mb-2 mt-5 text-[13px] font-medium text-ink">Screenshots and evidence</h3>
      <EvidenceList items={d.evidence} />
    </Card>
  );
}

// ── failed test cases ────────────────────────────────────────────────────────
function FailedTests({ r, params }: { r: QaReport; params: URLSearchParams }) {
  const module = params.get('module') ?? '';
  const test = params.get('test') ?? '';
  const unlinked = params.get('unlinked') === '1';
  const rows = r.failures.filter((f) => (!module || f.moduleId === module) && (!test || f.id === test) && (!unlinked || !f.defectIds.length));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-3">
        <label className="flex items-center gap-1.5">Module
          <select value={module} onChange={(e) => goReport('failed', { module: e.target.value, unlinked: unlinked ? '1' : '' })} className="h-8 rounded-full border border-line bg-card px-2.5 text-[12px] text-ink">
            <option value="">All</option>
            {r.modules.filter((m) => m.failed).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.failed})</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={unlinked} onChange={(e) => goReport('failed', { module, unlinked: e.target.checked ? '1' : '' })} /> Only failures not linked to a defect</label>
        {test && <button onClick={() => goReport('failed')} className="rounded-full border border-line px-2.5 py-1 text-ink-2 hover:text-ink">Showing {test} · show all</button>}
        <span className="ml-auto">{rows.length} of {r.failures.length} failed test cases</span>
      </div>
      <p className="text-[12.5px] text-ink-2">A failed test case is not automatically a new defect: each is linked to the defect behind it, or marked for investigation.</p>
      {rows.map((f) => <FailureCard key={f.key} f={f} />)}
      {!rows.length && <Card className="p-6 text-center text-[12.5px] text-ink-3">No failed test case matches.</Card>}
    </div>
  );
}

function FailureCard({ f }: { f: Failure }) {
  const [shots, setShots] = useState(false);
  return (
    <Card className="p-5" as="article" label={`${f.id} ${f.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11.5px] text-ink-3">{f.id} · {f.module} · {f.executionId}{f.retried ? ' · also failed on retry' : ''}</p>
          <h2 className="mt-0.5 text-[15px] font-medium text-ink">{f.title}</h2>
        </div>
        <Badge value="Failed" />
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-8 xl:grid-cols-2">
        <div>
          <Field k="What went wrong">{f.simple}</Field>
          <Field k="Expected behaviour">{f.expected}</Field>
          <Field k="Actual behaviour">{f.actual}</Field>
          <Field k="Business impact">{f.impact}{f.impactBasis ? <span className="text-ink-3"> (based on the {f.impactBasis})</span> : null}</Field>
        </div>
        <div>
          <Field k="Test scenario">{f.scenario}</Field>
          <Field k="Test data">{f.testData}</Field>
          <Field k="Associated defect">
            {f.defectLinks.length ? f.defectLinks.map((l) => (
              <span key={l.id} className="block"><button onClick={() => goReport('defects', { id: l.id })} className="text-electric hover:underline">{l.id}</button> {l.title} <span className="text-ink-3">({l.label})</span></span>
            )) : <Badge value={f.defectNote ?? 'Defect Not Linked'} tone="red" />}
          </Field>
          {f.unresolvedTags.length > 0 && <Field k="Note">The test names {f.unresolvedTags.join(', ')}, which is not in the defect register.</Field>}
          {f.analysis.map((a, i) => <Field key={i} k="Earlier analysis">{a}</Field>)}
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setShots((s) => !s)} aria-expanded={shots} className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 hover:text-ink">
          <ChevronDown size={12} className={shots ? 'rotate-180' : ''} aria-hidden /> Evidence ({f.evidence.filter((e) => e.figure).length} screenshot{f.evidence.filter((e) => e.figure).length === 1 ? '' : 's'})
        </button>
      </div>
      {shots && <div className="mt-3 max-w-[900px]"><EvidenceList items={f.evidence} /></div>}
      {f.technical && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] text-ink-3">Technical details (original automation error)</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-white/[0.04] p-3 font-mono text-[11px] text-ink-2">{f.technical}</pre>
        </details>
      )}
    </Card>
  );
}

// ── accessibility ────────────────────────────────────────────────────────────
function Accessibility({ r }: { r: QaReport }) {
  const a = r.accessibility;
  return (
    <Card className="p-5">
      <CardTitle>Accessibility coverage by theme</CardTitle>
      {!a.available ? (
        <p className="mt-3 text-[12.5px] text-ink-2">Coverage Not Available: the executions in this report kept no theme-specific accessibility scans.</p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <caption className="sr-only">Accessibility results per theme</caption>
              <thead><tr className="border-b border-line text-left text-[11.5px] text-ink-3">{['Theme', 'Test cases', 'Passed', 'Failed', 'Not tested', 'Defects'].map((h, i) => <th key={h} scope="col" className={`py-2 pr-3 font-normal ${i && i < 5 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {a.themes.map((t) => (
                  <tr key={t.key} className="border-b border-line/60">
                    <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">{t.label}</th>
                    {t.available ? (
                      <>
                        <td className="py-2 pr-3 text-right tabular-nums">{t.tests}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-good">{t.passed}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-bad">{t.failed}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{t.notTested}</td>
                        <td className="py-2 text-ink-2">{t.defects.length ? t.defects.map((id) => <button key={id} onClick={() => goReport('defects', { id })} className="mr-2 text-electric hover:underline">{id}</button>) : 'None'}</td>
                      </>
                    ) : <td colSpan={5} className="py-2 text-ink-3">Coverage Not Available</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 flex gap-2 text-[11.5px] text-ink-3"><Info size={13} className="mt-px shrink-0" aria-hidden />{a.basis} {a.testCases} test cases were scanned in at least one theme ({a.scans} scans); "Not tested" counts those with no scan in that theme.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px] text-ink-2">{r.observations.accessibility.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}
    </Card>
  );
}

// ── history and validation ───────────────────────────────────────────────────
function HistoryAndValidation({ r }: { r: QaReport }) {
  const c = r.comparison;
  const level = { error: 'red', warning: 'orange', info: 'blue' } as const;
  return (
    <>
      <Card className="p-5">
        <CardTitle>Comparison with the previous execution</CardTitle>
        {c.available ? (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-[12.5px]">
                <caption className="sr-only">Pass rate per module, previous and latest execution</caption>
                <thead><tr className="border-b border-line text-left text-[11.5px] text-ink-3">{['Module', 'Previous', 'Pass %', 'Latest', 'Pass %', 'Change', 'Fixed', 'New failures'].map((h, i) => <th key={i} scope="col" className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead>
                <tbody>
                  {c.modules.map((m) => (
                    <tr key={m.id} className="border-b border-line/60">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">{m.name}</th>
                      <td className="py-2 pr-3 text-[11.5px] text-ink-2">{m.previous ?? '—'}</td><td className="py-2 pr-3 tabular-nums">{pct(m.previousPassPct)}</td>
                      <td className="py-2 pr-3 text-[11.5px] text-ink-2">{m.current}</td><td className="py-2 pr-3 tabular-nums">{pct(m.passPct)}</td>
                      <td className={`py-2 pr-3 tabular-nums ${m.change && m.change > 0 ? 'text-good' : m.change && m.change < 0 ? 'text-bad' : 'text-ink-2'}`}>{m.change == null ? '—' : `${m.change > 0 ? '+' : ''}${m.change} pts`}{m.sameCoverage === false ? ' *' : ''}</td>
                      <td className="py-2 pr-3 text-[11.5px] text-ink-2">{m.improved?.join(', ') || '—'}</td>
                      <td className="py-2 text-[11.5px] text-ink-2">{m.regressed?.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.modules.filter((m) => m.note && m.previous).map((m) => <p key={m.id} className="mt-1 text-[11.5px] text-ink-3">* {m.name}: {m.note}</p>)}
            <dl className="mt-3 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <Field k="New defects">{c.defects.new.join(', ') || 'None'}</Field>
              <Field k="No longer failing">{c.defects.resolved.join(', ') || 'None'}</Field>
              <Field k="Reopened / failed retest">{c.defects.reopened.join(', ') || 'None'}</Field>
              <Field k="Persistent">{c.defects.persistent.join(', ') || 'None'}</Field>
            </dl>
          </>
        ) : null}
        <p className="mt-3 text-[11.5px] text-ink-3">{c.note}</p>
      </Card>
      <Card className="p-5">
        <CardTitle right={<span className="text-[11.5px] text-ink-3">fingerprint {r.meta.fingerprint}</span>}>Data validation</CardTitle>
        <p className="mt-2 text-[12.5px] text-ink-2">The data is checked before every report: module totals against the overall total, each module's outcomes against its total, unique defect ids, every defect reference, missing defect fields, possible duplicates and every evidence file. Nothing is corrected silently.</p>
        <ul className="mt-3 space-y-2">
          {r.validation.map((v, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-line px-3 py-2 text-[12.5px]">
              <Badge value={v.level[0].toUpperCase() + v.level.slice(1)} tone={level[v.level]} />
              <div className="min-w-0"><p className="text-ink"><span className="text-ink-3">{v.check}:</span> {v.message}</p><p className="text-[11px] text-ink-3">Source: {v.source}</p></div>
            </li>
          ))}
          {!r.validation.length && <li className="text-[12.5px] text-good">Every check passed.</li>}
        </ul>
      </Card>
    </>
  );
}
