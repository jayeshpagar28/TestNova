import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown, CircleAlert, CircleDashed, Eye, FileText, Globe, Loader2, Maximize2, Menu, Minimize2, Monitor, Pause, Play, RotateCcw, Save,
  ScrollText, SkipForward, Square, TriangleAlert, X,
} from 'lucide-react';
import { Card, CardTitle } from '../Card';
import { Orb } from '../Orb';
import { ThemeToggle } from '../ThemeToggle';
import { EASE_OUT, PARTICLES } from '../../theme';
import { goDashboard, goSetup } from '../../lib/router';
import { ApiError, fmtElapsed, pipelineApi, usePipeline, type LogEntry, type Pipeline, type Stage, type StageStatus } from '../../data/setup';
import { CsvTable, Markdown } from './Markdown';
import { ProjectName } from '../ProjectName';

const STATUS: Record<StageStatus, { label: string; cls: string; dot: string }> = {
  waiting: { label: 'Waiting', cls: 'border-line text-ink-3', dot: 'bg-ink-3' },
  running: { label: 'Running', cls: 'border-electric/50 bg-electric/10 text-electric', dot: 'bg-electric' },
  passed: { label: 'Passed', cls: 'border-good/40 bg-good/10 text-good', dot: 'bg-good' },
  failed: { label: 'Failed', cls: 'border-bad/40 bg-bad/10 text-bad', dot: 'bg-bad' },
  review: { label: 'Needs review', cls: 'border-warn/50 bg-warn/10 text-warn', dot: 'bg-warn' },
  stopped: { label: 'Stopped', cls: 'border-bad/30 text-bad/80', dot: 'bg-bad/70' },
  skipped: { label: 'Skipped', cls: 'border-warn/30 text-warn/80', dot: 'bg-warn/70' },
};

const PIPELINE_LABEL: Record<Pipeline['status'], string> = {
  idle: 'Not started', running: 'Running', paused: 'Waiting for your review', failed: 'Failed', stopped: 'Stopped', completed: 'Completed',
};

/** Ticks once a second while something is running, so elapsed times move. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Particles falling along the connector between two stage nodes while energy flows through it. */
function Connector({ active, done }: { active: boolean; done: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative ml-[27px] h-8 w-px" aria-hidden>
      <span className={`absolute inset-0 ${done ? 'bg-gradient-to-b from-good/60 to-good/20' : active ? 'bg-gradient-to-b from-electric/70 to-lilac/30' : 'bg-white/10'}`} />
      {active && !reduce &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full"
            style={{ background: PARTICLES[i % PARTICLES.length], boxShadow: `0 0 8px ${PARTICLES[i % PARTICLES.length]}` }}
            initial={{ top: '-10%', opacity: 0 }}
            animate={{ top: ['-10%', '110%'], opacity: [0, 1, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.45, ease: 'easeIn' }}
          />
        ))}
    </div>
  );
}

function StatusBadge({ status }: { status: StageStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] ${s.cls}`}>
      {status === 'running' ? <Loader2 size={11} className="animate-spin" /> : <span className={`size-1.5 rounded-full ${s.dot}`} />}
      {s.label}
    </span>
  );
}

function LogView({ entries }: { entries: LogEntry[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [entries.length, follow]);
  if (!entries.length) return <p className="rounded-xl border border-line bg-black/20 px-3 py-4 text-[12px] text-ink-3">No log yet.</p>;
  return (
    <div
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget;
        setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
      }}
      className="max-h-[300px] overflow-y-auto rounded-xl border border-line bg-black/25 p-3 font-mono text-[11.5px] leading-relaxed"
      aria-live="polite"
    >
      {entries.map((e, i) => (
        <div key={i} className="flex gap-2">
          <span className="shrink-0 text-ink-3">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
          {e.kind === 'tool' ? (
            <span className="min-w-0 break-words text-ink-2"><span className="text-lilac">{e.tool}</span> <span className="text-ink-3">{e.text}</span></span>
          ) : (
            <span className={`min-w-0 whitespace-pre-wrap break-words ${e.kind === 'error' || e.kind === 'tool-error' ? 'text-bad' : e.kind === 'system' || e.kind === 'result' ? 'text-good' : e.kind === 'stderr' ? 'text-ink-3' : 'text-ink'}`}>
              {e.text}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** "browser:click" + its input, as a short caption: the element, URL or text the action is about. */
function actionCaption(e: LogEntry | undefined) {
  if (!e?.tool) return '';
  let what = '';
  try {
    const input = JSON.parse(e.text ?? '{}') as Record<string, unknown>;
    what = String(input.element ?? input.url ?? input.text ?? input.key ?? input.filename ?? '');
  } catch {
    // the logged input is cut at 400 characters and may not parse: show the tool alone
  }
  return `${e.tool.replace(/^browser:browser_/, 'browser:')}${what ? ` · ${what}` : ''}`.slice(0, 160);
}

const IMAGE = /\.(png|jpe?g)$/i;

/**
 * The agent's browser while the stage runs (a passive screencast, see dashboard/server/live.mjs), and
 * the screenshots it captured once it has finished. Read-only: nothing here reaches the page.
 */
function LivePreview({ stage, logs, onOpenFile }: { stage: Stage; logs: LogEntry[]; onOpenFile: (path: string, editable: boolean) => void }) {
  const running = stage.status === 'running';
  const shots = useMemo(() => stage.files.filter((f) => IMAGE.test(f)), [stage.files]);
  const [open, setOpen] = useState(true);
  const [big, setBig] = useState(false);
  const [live, setLive] = useState<{ state: 'off' | 'waiting' | 'live'; url: string; img: string }>({ state: 'off', url: '', img: '' });
  const [pick, setPick] = useState<string | null>(null);
  const since = useRef(0);

  // poll the latest frame while the stage runs and the preview is on screen
  useEffect(() => {
    if (!running || (!open && !big)) return undefined;
    let alive = true;
    let inFlight = false;
    const poll = () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      pipelineApi.live(stage.n, since.current).then((r) => {
        if (!alive) return;
        if (r.frame && r.at) since.current = r.at;
        setLive((l) => ({ state: r.state, url: r.url ?? l.url, img: r.frame ? `data:image/jpeg;base64,${r.frame}` : r.state === 'off' ? '' : l.img }));
      }).catch(() => {}).finally(() => {
        inFlight = false;
      });
    };
    poll();
    const t = setInterval(poll, 800);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [running, open, big, stage.n, stage.attempt]);
  useEffect(() => {
    if (!running) {
      since.current = 0;
      setLive({ state: 'off', url: '', img: '' });
    }
  }, [running]);
  useEffect(() => {
    if (!big) return undefined;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setBig(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [big]);

  const lastAction = useMemo(() => actionCaption([...logs].reverse().find((e) => e.kind === 'tool' && e.tool?.startsWith('browser:'))), [logs]);
  const isLive = running && live.state === 'live' && !!live.img;
  const shot = pick && shots.includes(pick) ? pick : shots.at(-1) ?? null;
  // nothing to show: a document-only stage that is not running, or one that never opened a browser
  if (!running && !shots.length) return null;
  if (running && live.state === 'off' && !shots.length && !live.img) {
    return <p className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[12px] text-ink-3"><Monitor size={13} /> This stage works with files, not the browser: follow it in the execution log.</p>;
  }

  const frame = (large: boolean) => (
    <div className="overflow-hidden rounded-xl border border-line bg-black/40">
      <div className="flex items-center gap-2 border-b border-line bg-black/30 px-3 py-1.5 font-mono text-[11px] text-ink-3">
        <Globe size={12} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{isLive ? live.url : shot ? shot.replace(/^qa\//, '') : live.url || 'Starting the browser…'}</span>
        {isLive ? (
          <span className="flex shrink-0 items-center gap-1.5 text-bad"><span className="live-dot size-1.5 rounded-full bg-bad" /> LIVE</span>
        ) : running ? (
          <span className="flex shrink-0 items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> {live.state === 'waiting' ? 'Browser closed between steps' : 'Connecting'}</span>
        ) : (
          <span className="shrink-0">Screenshot</span>
        )}
      </div>
      <div className={`relative grid w-full place-items-center bg-black/50 ${large ? 'aspect-video max-h-[78vh]' : 'aspect-video'}`}>
        {isLive || (running && live.img) ? (
          <img src={live.img} alt={`The agent's browser: ${live.url}`} className={`size-full object-contain ${isLive ? '' : 'opacity-50'}`} />
        ) : shot && !running ? (
          <button onClick={() => onOpenFile(shot, false)} className="size-full" title="Open the screenshot">
            <img src={pipelineApi.fileUrl(shot)} alt={shot} className="size-full object-contain" />
          </button>
        ) : (
          <p className="flex items-center gap-2 text-[12px] text-ink-3"><Loader2 size={13} className="animate-spin" /> Waiting for the agent to open the browser…</p>
        )}
        {running && lastAction && (
          <p className="absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-md border border-line bg-black/75 px-2 py-1 font-mono text-[11px] text-ink-2">{lastAction}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12px] text-ink-2 hover:text-ink">
          <ChevronDown size={14} className={`shrink-0 text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} />
          <Monitor size={13} className="shrink-0 text-lilac" />
          {running ? 'Live preview' : `Screenshots · ${shots.length}`}
          {isLive && <span className="live-dot size-1.5 rounded-full bg-bad" />}
        </button>
        {open && (
          <button onClick={() => setBig(true)} className="flex items-center gap-1 rounded-full border border-line-2 px-2.5 py-0.5 text-[11.5px] text-ink-2 hover:text-ink">
            <Maximize2 size={11} /> Expand
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {frame(false)}
          {!running && shots.length > 1 && (
            <ul className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Screenshots from this stage">
              {shots.slice(-30).map((f) => (
                <li key={f} className="shrink-0">
                  <button onClick={() => setPick(f)} title={f.replace(/^qa\//, '')} className={`block h-12 w-20 overflow-hidden rounded-md border ${f === shot ? 'border-lilac' : 'border-line opacity-70 hover:opacity-100'}`}>
                    <img src={pipelineApi.fileUrl(f)} alt="" loading="lazy" className="size-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* a portal: the stage card's animated (transformed) ancestors would trap a fixed overlay */}
      {createPortal(<AnimatePresence>
        {big && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setBig(false)} />
            <motion.div role="dialog" aria-label={`Stage ${stage.n} live preview`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="fixed inset-x-4 top-[4%] z-50 mx-auto flex max-w-[1400px] flex-col gap-3 rounded-[22px] border border-line-2 bg-panel p-4">
              <div className="flex items-center gap-3">
                <Monitor size={15} className="text-lilac" />
                <p className="min-w-0 flex-1 truncate text-[13px] text-ink">Stage {stage.n} · {stage.name}</p>
                <button onClick={() => setBig(false)} className="flex items-center gap-1 rounded-full border border-line-2 px-3 py-1 text-[12px] text-ink-2 hover:text-ink"><Minimize2 size={12} /> Collapse</button>
              </div>
              {frame(true)}
            </motion.div>
          </>
        )}
      </AnimatePresence>, document.body)}
    </div>
  );
}

/** The full technical log, collapsed to its latest line until opened. */
function LogSection({ entries }: { entries: LogEntry[] }) {
  const [open, setOpen] = useState(false);
  const last = entries.at(-1);
  return (
    <div className="rounded-xl border border-line">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-ink-2 hover:text-ink">
        <ChevronDown size={14} className={`shrink-0 text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} />
        <ScrollText size={13} className="shrink-0 text-lilac" />
        <span className="shrink-0">Execution log{entries.length > 0 && <span className="text-ink-3"> · {entries.length} entries</span>}</span>
        {!open && last && (
          <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${last.kind === 'error' || last.kind === 'tool-error' ? 'text-bad' : 'text-ink-3'}`}>
            {new Date(last.at).toLocaleTimeString([], { hour12: false })} {last.kind === 'tool' ? last.tool : String(last.text ?? '').split('\n').find((l) => l.trim())}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3"><LogView entries={entries} /></div>}
    </div>
  );
}

const COUNT_LABEL: Record<string, string> = {
  stories: 'User stories', screenshots: 'Screenshots', modules: 'Modules', rules: 'Business rules', flows: 'User flows', gaps: 'Open questions',
  plans: 'Test plans', cases: 'Test cases', passed: 'Passed', failed: 'Failed', blocked: 'Blocked', specs: 'Spec files', tests: 'Tests', pages: 'Page objects',
  executions: 'Executions', defects: 'Defects', critical: 'Critical', notDefects: 'Not defects', reports: 'Report files',
};

function StageCard({
  stage, pipeline, logs, loadLog, canControl, now, onOpenFile, delay,
}: {
  stage: Stage; pipeline: Pipeline; logs: LogEntry[]; loadLog: () => void; canControl: boolean; now: number; onOpenFile: (path: string, editable: boolean) => void; delay: number;
}) {
  const [open, setOpen] = useState(stage.status === 'running' || stage.status === 'review' || stage.status === 'failed');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (stage.status === 'running' || stage.status === 'review') setOpen(true);
  }, [stage.status]);
  useEffect(() => {
    if (open) loadLog();
  }, [open, stage.attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = stage.startedAt ? (stage.endedAt ?? (stage.status === 'running' ? now : stage.startedAt)) - stage.startedAt : null;
  const busyPipeline = pipeline.status === 'running';
  const act = async (action: 'retry' | 'skip' | 'approve', fresh = false) => {
    if (action === 'skip' && !window.confirm(`Skip stage ${stage.n} (${stage.name})?\n\nLater stages will run without its outputs and may fail or be incomplete.`)) return;
    if (fresh && !window.confirm(`Start stage ${stage.n} (${stage.name}) over?\n\nIts checkpoint is discarded and the agent starts from scratch. Files already on disk stay, but may be rewritten.`)) return;
    setBusy(fresh ? 'fresh' : action);
    setError('');
    try {
      await pipelineApi.stage(stage.n, action, fresh);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const counts = Object.entries(stage.counts ?? {});
  const running = stage.status === 'running';

  return (
    <Card delay={delay} glow={running} className={`p-0 ${running ? 'ring-1 ring-electric/30' : ''}`} label={`Stage ${stage.n}: ${stage.name}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-4 p-4 text-left">
        <span className={`relative grid size-[54px] shrink-0 place-items-center rounded-full border text-[15px] font-medium ${
          running ? 'border-electric/50 bg-electric/15 text-ink shadow-[0_0_24px_rgb(47_123_255/0.45)]'
            : stage.status === 'passed' ? 'border-good/40 bg-good/10 text-good'
              : stage.status === 'failed' || stage.status === 'stopped' ? 'border-bad/40 bg-bad/10 text-bad'
                : stage.status === 'review' ? 'border-warn/50 bg-warn/10 text-warn'
                  : 'border-line bg-white/[0.03] text-ink-3'
        }`}>
          {stage.status === 'passed' ? <Check size={20} /> : stage.n}
          {running && <span className="absolute inset-0 animate-ping rounded-full border border-electric/40" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] text-ink">{stage.name}</h3>
            <StatusBadge status={stage.status} />
            {stage.attempt > 1 && <span className="text-[11px] text-ink-3">attempt {stage.attempt}</span>}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{stage.title}</p>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-[15px] tabular-nums text-ink">{fmtElapsed(elapsed)}</p>
          <p className="text-[11px] text-ink-3">{stage.agent}</p>
        </div>
        <ChevronDown size={16} className={`shrink-0 text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE_OUT }} className="overflow-hidden">
            <div className="flex flex-col gap-4 border-t border-line p-4">
              {counts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {counts.map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-line bg-white/[0.03] px-3 py-1.5">
                      <p className="text-[17px] tabular-nums text-ink">{v ?? '—'}</p>
                      <p className="text-[10.5px] uppercase tracking-wide text-ink-3">{COUNT_LABEL[k] ?? k}</p>
                    </div>
                  ))}
                </div>
              )}
              {stage.warning && <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[12.5px] text-ink"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />{stage.warning}</p>}
              {stage.error && <p className="flex items-start gap-2 whitespace-pre-wrap rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-[12.5px] text-ink"><CircleAlert size={14} className="mt-0.5 shrink-0 text-bad" />{stage.error}</p>}
              {stage.status === 'review' && (
                <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[12.5px] text-ink">
                  <Eye size={14} className="mt-0.5 shrink-0 text-warn" /> The outputs validated. Open and edit any file below, then approve to continue the pipeline.
                </p>
              )}

              <LivePreview stage={stage} logs={logs} onOpenFile={onOpenFile} />
              <LogSection entries={logs} />

              <div>
                <p className="mb-2 text-[12px] text-ink-2">Files produced {stage.files.length > 0 && <span className="text-ink-3">· {stage.files.length}</span>}</p>
                {stage.files.length ? (
                  <ul className="flex max-h-[220px] flex-wrap gap-1.5 overflow-y-auto">
                    {stage.files.map((f) => (
                      <li key={f}>
                        <button onClick={() => onOpenFile(f, stage.status === 'review')} className="flex max-w-[360px] items-center gap-1.5 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-ink-2 hover:border-lilac/40 hover:text-ink">
                          <FileText size={12} className="shrink-0 text-lilac" />
                          <span className="truncate">{f.replace(/^qa\//, '')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-ink-3">None yet. Writes to {stage.outputs.join(', ')}.</p>
                )}
              </div>

              {stage.result && (
                <p className="text-[11.5px] text-ink-3">
                  {stage.result.turns} turns{stage.result.cost != null && <> · ${stage.result.cost.toFixed(2)}</>}
                </p>
              )}

              {canControl && stage.n === 2 && stage.status === 'review' && <ModulePicker />}

              {canControl && (
                <div className="flex flex-wrap gap-2">
                  {stage.status === 'review' && (
                    <button onClick={() => act('approve')} disabled={!!busy} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[12.5px] font-medium text-[#111] disabled:opacity-50">
                      {busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve and continue
                    </button>
                  )}
                  {['failed', 'stopped'].includes(stage.status) && stage.attempt > 0 && (
                    <>
                      <button onClick={() => act('retry')} disabled={busyPipeline || !!busy} title="Continue from the checkpoint: completed work is kept and not redone" className="flex items-center gap-1.5 rounded-full border border-line-2 px-3.5 py-1.5 text-[12.5px] text-ink-2 hover:text-ink disabled:opacity-40">
                        {busy === 'retry' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Resume stage
                      </button>
                      <button onClick={() => act('retry', true)} disabled={busyPipeline || !!busy} title="Discard the checkpoint and run this stage from scratch" className="flex items-center gap-1.5 rounded-full border border-line-2 px-3.5 py-1.5 text-[12.5px] text-ink-3 hover:text-ink disabled:opacity-40">
                        {busy === 'fresh' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Start over
                      </button>
                    </>
                  )}
                  {['passed', 'review', 'skipped'].includes(stage.status) && (
                    <button onClick={() => act('retry')} disabled={busyPipeline || !!busy} className="flex items-center gap-1.5 rounded-full border border-line-2 px-3.5 py-1.5 text-[12.5px] text-ink-2 hover:text-ink disabled:opacity-40">
                      {busy === 'retry' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Run again
                    </button>
                  )}
                  {['waiting', 'failed', 'stopped', 'review'].includes(stage.status) && (
                    <button onClick={() => act('skip')} disabled={busyPipeline || !!busy} className="flex items-center gap-1.5 rounded-full border border-warn/40 px-3.5 py-1.5 text-[12.5px] text-warn hover:bg-warn/10 disabled:opacity-40">
                      <SkipForward size={13} /> Skip stage
                    </button>
                  )}
                </div>
              )}
              {error && <p className="text-[12px] text-bad">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

const KB_FILE = 'qa/00-knowledge-base/knowledge-base.json';
interface KbModule { id: string; name: string; order?: number; skip?: boolean; skipReason?: string | null }
const DESELECTED = 'Not selected for testing at the knowledge-base review';

/**
 * "Modules to test", while the knowledge base waits for review. A module left unticked gets
 * `skip: true` in knowledge-base.json, which every later stage, its checks and the dashboard
 * already honour: it is not planned, tested, automated or executed, so the run is shorter.
 */
function ModulePicker() {
  const [kb, setKb] = useState<{ modules: KbModule[] } | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    pipelineApi.file(KB_FILE).then((text) => {
      const data = JSON.parse(text) as { modules: KbModule[] };
      setKb(data);
      setSkipped(new Set(data.modules.filter((m) => m.skip).map((m) => m.id)));
    }).catch((e) => setError(`Could not read the module list: ${(e as Error).message}`));
  }, []);

  if (!kb) return error ? <p className="text-[12px] text-bad">{error}</p> : null;
  const modules = [...kb.modules].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const selected = modules.length - skipped.size;
  const changed = modules.some((m) => Boolean(m.skip) !== skipped.has(m.id));
  const toggle = (id: string) => setSkipped((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const next = {
        ...kb,
        modules: kb.modules.map((m) => {
          if (skipped.has(m.id)) return { ...m, skip: true, skipReason: m.skip ? (m.skipReason ?? DESELECTED) : DESELECTED };
          return { ...m, skip: false, skipReason: null };
        }),
      };
      await pipelineApi.saveFile(KB_FILE, `${JSON.stringify(next, null, 2)}\n`);
      setKb(next);
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset className="min-w-0 rounded-2xl border border-line bg-white/[0.02] p-3">
      <legend className="px-1 text-[12px] text-ink-2">Modules to test</legend>
      <p className="text-[11.5px] text-ink-3">
        Untick the modules this run should leave out. Every later stage skips them (no plan, testing, automation or execution), so the pipeline finishes sooner. Save, then approve.
      </p>
      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {modules.map((m) => {
          const id = `kb-module-${m.id}`;
          return (
            <li key={m.id}>
              <label htmlFor={id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 text-[12.5px] text-ink hover:bg-white/[0.04]">
                <input id={id} type="checkbox" className="mt-0.5 accent-[#a99cff]" checked={!skipped.has(m.id)} onChange={() => toggle(m.id)} />
                <span className="min-w-0">
                  {m.name}
                  {m.skip && m.skipReason && m.skipReason !== DESELECTED && <span className="block text-[11px] text-warn">Skipped by the knowledge base: {m.skipReason}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving || !changed || selected === 0} className="flex items-center gap-1.5 rounded-full border border-line-2 px-3.5 py-1.5 text-[12.5px] text-ink-2 hover:text-ink disabled:opacity-40">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save selection
        </button>
        <span className="text-[11.5px] text-ink-3" aria-live="polite">
          {selected} of {modules.length} selected{selected === 0 ? ' · keep at least one' : ''}{!changed && savedAt ? ' · saved' : changed ? ' · not saved yet' : ''}
        </span>
      </div>
      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
    </fieldset>
  );
}

function FileViewer({ path, editable, onClose }: { path: string; editable: boolean; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const binary = ['png', 'jpg', 'jpeg', 'webm', 'zip', 'pdf', 'xlsx'].includes(ext);
  const canEdit = editable && ['md', 'json', 'csv', 'txt'].includes(ext);

  useEffect(() => {
    if (binary) return;
    pipelineApi.file(path).then((t) => {
      setText(t);
      setDraft(t);
    }).catch((e) => setError((e as Error).message));
  }, [path, binary]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await pipelineApi.saveFile(path, draft);
      setText(draft);
      setMode('view');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const pretty = useMemo(() => {
    if (ext !== 'json' || text == null) return text;
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }, [ext, text]);

  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div role="dialog" aria-label={path} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} className="fixed inset-x-4 bottom-4 top-[6%] z-50 mx-auto flex max-w-5xl flex-col overflow-hidden rounded-[22px] border border-line-2 bg-panel">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <FileText size={15} className="text-lilac" />
          <p className="min-w-0 flex-1 truncate text-[13px] text-ink">{path}</p>
          {canEdit && mode === 'view' && <button onClick={() => setMode('edit')} className="rounded-full border border-line-2 px-3 py-1 text-[12px] text-ink-2 hover:text-ink">Edit</button>}
          {mode === 'edit' && (
            <>
              <button onClick={() => { setDraft(text ?? ''); setMode('view'); }} className="rounded-full border border-line-2 px-3 py-1 text-[12px] text-ink-2">Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-[#111]">{saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save</button>
            </>
          )}
          <a href={pipelineApi.fileUrl(path)} target="_blank" rel="noreferrer" className="rounded-full border border-line-2 px-3 py-1 text-[12px] text-ink-2 hover:text-ink">Raw</a>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-white/[0.06] hover:text-ink"><X size={15} /></button>
        </div>
        {error && <p className="mx-5 mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-[12.5px] text-ink">{error}</p>}
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {binary ? (
            ['png', 'jpg', 'jpeg'].includes(ext) ? <img src={pipelineApi.fileUrl(path)} alt={path} className="mx-auto max-w-full rounded-xl border border-line" />
              : ext === 'webm' ? <video src={pipelineApi.fileUrl(path)} controls className="mx-auto max-w-full rounded-xl" />
                : <p className="text-[13px] text-ink-2">This file cannot be shown here. <a className="text-lilac underline" href={pipelineApi.fileUrl(path)}>Download it</a>.</p>
          ) : text == null ? (
            !error && <p className="text-[13px] text-ink-3">Loading…</p>
          ) : mode === 'edit' ? (
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} className="h-full min-h-[60vh] w-full resize-none rounded-xl border border-line bg-black/25 p-3 font-mono text-[12px] leading-relaxed text-ink outline-none focus:border-lilac/50" />
          ) : ext === 'md' ? <Markdown text={text} />
            : ext === 'csv' ? <CsvTable text={text} />
              : <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink-2">{pretty}</pre>}
        </div>
      </motion.div>
    </>
  );
}

export function PipelinePage({ onMenu }: { onMenu: () => void }) {
  const { pipeline, canControl, logs, loadLog, loaded } = usePipeline();
  const [file, setFile] = useState<{ path: string; editable: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const running = pipeline?.status === 'running';
  const now = useNow(running);

  if (!loaded) return <p className="py-20 text-center text-[13px] text-ink-3">Loading pipeline…</p>;
  if (!pipeline) {
    return (
      <Card className="mt-10 p-8 text-center" label="No project">
        <p className="text-[15px] text-ink">No project is configured yet.</p>
        <p className="mt-2 text-[13px] text-ink-2">Set up the application, its test logins and knowledge sources first.</p>
        <button onClick={goSetup} className="mt-5 rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-[#111]">Open Project Setup</button>
      </Card>
    );
  }

  const done = pipeline.stages.filter((s) => s.status === 'passed').length;
  const current = pipeline.stages.find((s) => s.status === 'running') ?? null;
  // energy: calm when idle, rising through the stages while one runs
  const energy = running ? 1.6 + (done / 8) * 1.6 : pipeline.status === 'completed' ? 1.3 : 1;
  const total = pipeline.startedAt ? (pipeline.endedAt ?? (running ? now : pipeline.startedAt)) - pipeline.startedAt : null;
  // with every stage passed, Start re-validates the outputs and resumes any stage that no longer holds
  const allPassed = pipeline.stages.every((s) => s.status === 'passed' || s.status === 'skipped');
  const canStart = canControl && !running && !pipeline.stages.some((s) => s.status === 'review');

  const call = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  // The project's testing type was changed after this run started
  const pending = pipeline.pendingTestingType ?? null;
  // A switch is confirmed first; a Security Testing run also needs the operator's authorization
  // (asked once per run, when the server says it is required).
  const start = () => call('start', async () => {
    if (pending && !window.confirm(`Switch this pipeline to ${pending.label}?\n\nStages 3–8 run again for ${pending.label}. Their current plans, results, healing log and specs move to qa/archive/. The knowledge base, page objects, executions and defect register are kept.`)) return;
    const opts = { switchTestingType: Boolean(pending) };
    try {
      await pipelineApi.start(pipeline.pauseForReview, opts);
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'AUTHORIZATION_REQUIRED') throw e;
      if (!window.confirm('Security Testing\n\nI confirm I am authorized to run safe, non-destructive security tests against this application in this non-production environment.')) return;
      const reference = window.prompt('Authorization reference (optional), for example an email or ticket id:', '') ?? '';
      await pipelineApi.start(pipeline.pauseForReview, { ...opts, securityAuthorization: { confirmed: true, reference } });
    }
  });

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
            <h1 className="text-[30px] font-light leading-tight tracking-[-0.01em] text-ink sm:text-[36px]">AI Pipeline<ProjectName /></h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
              <span className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${running ? 'live-dot bg-electric' : pipeline.status === 'completed' ? 'bg-good' : pipeline.status === 'paused' ? 'bg-warn' : pipeline.status === 'idle' ? 'bg-ink-3' : 'bg-bad'}`} />
                {PIPELINE_LABEL[pipeline.status]}
              </span>
              <span>{done} of 8 stages passed</span>
              <span>Testing type <span className="text-ink">{pipeline.testingTypeLabel ?? 'Full Coverage (Current Behaviour)'}</span></span>
              <span>Elapsed <span className="text-ink">{fmtElapsed(total)}</span></span>
              {pipeline.engine && <span>{pipeline.engine === 'sdk' ? 'Claude Agent SDK' : 'claude CLI'}</span>}
            </p>
          </div>
          {canControl && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-2" title="Pause after stages 2, 3 and 4 so you can check or edit their outputs">
                <input type="checkbox" checked={pipeline.pauseForReview} onChange={(e) => call('review', () => pipelineApi.review(e.target.checked))} className="accent-[#a99cff]" />
                <Pause size={12} /> Pause for my review
              </label>
              {running ? (
                <button onClick={() => window.confirm('Stop the pipeline? The running stage is marked stopped; its partial outputs stay on disk.') && call('stop', pipelineApi.stop)} disabled={!!busy} className="flex items-center gap-2 rounded-full border border-bad/50 px-4 py-2 text-[13px] text-bad hover:bg-bad/10">
                  <Square size={12} fill="currentColor" /> Stop pipeline
                </button>
              ) : (
                <motion.button whileHover={canStart ? { scale: 1.03 } : undefined} whileTap={canStart ? { scale: 0.97 } : undefined} onClick={start} disabled={!canStart || !!busy} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-[#111] disabled:opacity-40">
                  {busy === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
                  {pending ? `Switch to ${pending.label} and start` : pipeline.status === 'idle' ? 'Start pipeline' : allPassed ? 'Verify and continue' : 'Continue pipeline'}
                </motion.button>
              )}
            </div>
          )}
        </div>
        {pending && !running && (
          <p role="status" className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[12.5px] text-ink">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
            <span>
              This pipeline ran as <span className="font-medium">{pipeline.testingTypeLabel}</span>; the project is now <span className="font-medium">{pending.label}</span>.
              Starting switches it: stages 3–8 run again for {pending.label}, their current outputs move to qa/archive/, and the knowledge base, executions and defect register are kept.
            </span>
          </p>
        )}
        {pipeline.authorization && (
          <p className="text-[12px] text-ink-3">
            Security authorization: confirmed by <span className="text-ink-2">{pipeline.authorization.by}</span> on {new Date(pipeline.authorization.at).toLocaleString()}
            {pipeline.authorization.reference && <> · reference <span className="text-ink-2">{pipeline.authorization.reference}</span></>} · scope {pipeline.authorization.scope}
          </p>
        )}
        {error && <p className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-[12.5px] text-ink">{error}</p>}
      </motion.header>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-12">
        <div className="2xl:col-span-4">
          <Card delay={0.1} glow className="sticky top-6 flex flex-col items-center p-5" label="Pipeline energy">
            <CardTitle>Pipeline flow</CardTitle>
            <div className="relative mt-2">
              <Orb energy={energy} />
              <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center">
                <p className="text-[26px] font-light tabular-nums text-ink">{done}<span className="text-ink-3">/8</span></p>
              </div>
            </div>
            <p className="mt-1 text-center text-[12.5px] text-ink-2">
              {current ? <>Stage {current.n} · <span className="text-ink">{current.name}</span></> : PIPELINE_LABEL[pipeline.status]}
            </p>
            <ol className="mt-4 grid w-full grid-cols-8 gap-1" aria-label="Stage progress">
              {pipeline.stages.map((s) => (
                <li key={s.n} title={`${s.n}. ${s.name}: ${STATUS[s.status].label}`} className={`h-1.5 rounded-full ${s.status === 'running' ? 'live-dot bg-electric' : STATUS[s.status].dot} ${s.status === 'waiting' ? 'opacity-30' : ''}`} />
              ))}
            </ol>
            {pipeline.status === 'completed' && (
              <button onClick={goDashboard} className="mt-5 w-full rounded-xl bg-white py-2.5 text-[13px] font-medium text-[#111]">Open the dashboard</button>
            )}
            {!canControl && <p className="mt-4 text-center text-[12px] text-warn">View only: the pipeline can only be controlled on the PC hosting TestNova.</p>}
          </Card>
        </div>

        <div className="flex flex-col 2xl:col-span-8">
          {pipeline.stages.map((s, i) => (
            <div key={s.n}>
              <StageCard
                stage={s}
                pipeline={pipeline}
                logs={logs[`${s.n}:${s.attempt}`] ?? []}
                loadLog={() => loadLog(s.n, s.attempt)}
                canControl={canControl}
                now={now}
                delay={0.15 + i * 0.06}
                onOpenFile={(path, editable) => setFile({ path, editable })}
              />
              {i < pipeline.stages.length - 1 && (
                <Connector active={s.status === 'running' || (s.status === 'passed' && pipeline.stages[i + 1].status === 'running')} done={s.status === 'passed' && pipeline.stages[i + 1].status === 'passed'} />
              )}
            </div>
          ))}
          {pipeline.stages.every((s) => s.status === 'waiting') && (
            <p className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-3"><CircleDashed size={14} /> Nothing has run yet. Start the pipeline to begin with the BA Agent.</p>
          )}
        </div>
      </div>

      <AnimatePresence>{file && <FileViewer key={file.path} path={file.path} editable={file.editable} onClose={() => setFile(null)} />}</AnimatePresence>
    </div>
  );
}
