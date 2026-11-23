import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, CheckCircle2, CircleAlert, Eye, EyeOff, FileImage, FileSpreadsheet, FileText, Globe, KeyRound, Layers, Link2, Loader2, Lock, Menu, NotebookPen, Palette, Plus, Rocket,
  ShieldAlert, ShieldCheck, Trash2, Upload, Workflow, X, type LucideIcon,
} from 'lucide-react';
import { Card, CardTitle } from '../Card';
import { ThemeToggle } from '../ThemeToggle';
import { EASE_OUT } from '../../theme';
import { goDashboard, goPipeline, goSetup } from '../../lib/router';
import { selectProject } from '../../data/projects';
import { ProjectList } from './ProjectList';
import { ApiError, BROWSERS, fmtSize, pipelineApi, setupApi, useProject, type Browser, type Project, type Source, type TestingType, type TestingTypeOption } from '../../data/setup';

const ACCEPT = '.pdf,.docx,.xlsx,.csv,.md,.txt,.png,.jpg,.jpeg,.gif,.webp';

/** What each testing type covers, in the words of its standard (prompts/testing-types/). */
const TESTING_TYPE_INFO: Record<string, { icon: LucideIcon; text: string }> = {
  full: { icon: Layers, text: 'Everything the pipeline covers today: functional behaviour, UI and accessibility in every theme, and a passive security baseline. The longest run.' },
  ui: { icon: Palette, text: 'Layout, visual consistency, responsive layouts, browsers, themes, accessibility and component states, per the UI Testing Standard.' },
  functional: { icon: Workflow, text: 'Features, business rules, validation and boundaries, workflows, CRUD and persistence, calculations, per the Functional Testing Standard.' },
  security: { icon: ShieldAlert, text: 'Safe, non-destructive OWASP Top 10:2025 checks of this application only, on a non-production environment you are authorized to test.' },
};
const typeInfo = (key: TestingType) => TESTING_TYPE_INFO[key ?? 'full'];
const typeLabel = (options: TestingTypeOption[], key: TestingType) => options.find((o) => o.key === key)?.label ?? 'Full Coverage (Current Behaviour)';

interface RoleForm {
  name: string;
  username: string;
  password: string;
  saved: { username: boolean; password: boolean; hint: string | null } | null;
}

const input = 'w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-ink-3 focus:border-lilac/50 focus:bg-white/[0.05] disabled:opacity-50';

function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-ink-2">{label}</span>
      {children}
      {error ? <span className="text-[11.5px] text-bad">{error}</span> : hint ? <span className="text-[11.5px] text-ink-3">{hint}</span> : null}
    </label>
  );
}

/**
 * A password field with a show / hide button. It reveals only what is typed in the form: a saved
 * password never comes back from the server (the API only says that one is set), so there is
 * nothing to reveal until a new one is typed.
 */
function PasswordInput({ value, onChange, disabled, placeholder, label }: { value: string; onChange: (v: string) => void; disabled: boolean; placeholder: string; label: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        className={`${input} pr-10`}
        type={shown ? 'text' : 'password'}
        value={value}
        disabled={disabled}
        autoComplete="new-password"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        disabled={disabled || !value}
        aria-label={`${shown ? 'Hide' : 'Show'} ${label}`}
        aria-pressed={shown}
        title={!value ? 'Type a password to show it (a saved password is never sent back to the page)' : shown ? 'Hide password' : 'Show password'}
        className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-3 transition hover:bg-white/[0.06] hover:text-ink disabled:opacity-40"
      >
        {shown ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

const STATUS_PILL: Record<Source['status'], { cls: string; label: string }> = {
  parsing: { cls: 'border-electric/40 bg-electric/10 text-electric', label: 'Parsing' },
  fetching: { cls: 'border-electric/40 bg-electric/10 text-electric', label: 'Fetching' },
  parsed: { cls: 'border-good/40 bg-good/10 text-good', label: 'Parsed' },
  fetched: { cls: 'border-good/40 bg-good/10 text-good', label: 'Fetched' },
  saved: { cls: 'border-good/40 bg-good/10 text-good', label: 'Saved' },
  failed: { cls: 'border-bad/40 bg-bad/10 text-bad', label: 'Failed' },
  'not-readable': { cls: 'border-warn/40 bg-warn/10 text-warn', label: 'Not readable' },
};

function SourceIcon({ s }: { s: Source }) {
  const Icon = s.kind === 'link' ? Link2 : s.kind === 'note' ? NotebookPen : s.type === 'image' ? FileImage : s.type === 'xlsx' || s.type === 'csv' ? FileSpreadsheet : FileText;
  return <Icon size={14} className="shrink-0 text-lilac" aria-hidden />;
}

function SourceChip({ s, onRemove, disabled }: { s: Source; onRemove: () => void; disabled: boolean }) {
  const pill = STATUS_PILL[s.status];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
      className="group flex min-w-0 items-center gap-2.5 rounded-2xl border border-line bg-white/[0.03] py-2 pl-3 pr-2"
      title={s.detail ?? undefined}
    >
      <SourceIcon s={s} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] text-ink">{s.name}</p>
        <p className="truncate text-[11px] text-ink-3">
          <span className="uppercase tracking-wide">{s.kind === 'file' ? s.type : s.kind}</span>
          {s.size != null && <> · {fmtSize(s.size)}</>}
          {s.detail && <> · {s.detail}</>}
        </p>
      </div>
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] ${pill.cls}`}>
        {(s.status === 'parsing' || s.status === 'fetching') && <Loader2 size={10} className="mr-1 inline animate-spin" />}
        {pill.label}
      </span>
      <button
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${s.name}`}
        className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-white/[0.06] hover:text-bad disabled:opacity-30"
      >
        <X size={14} />
      </button>
    </motion.li>
  );
}

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(file);
  });

/**
 * `fresh`: an empty form for a new project (#/setup/new). Saving it creates a separate project with
 * its own workspace, pipeline, results and reports, then switches the dashboard to it; the project
 * open before is left exactly as it was.
 */
export function SetupPage({ onMenu, fresh = false }: { onMenu: () => void; fresh?: boolean }) {
  const { project: openProject, setProject, canControl, testingTypes } = useProject();
  const project = fresh ? (openProject === undefined ? undefined : null) : openProject;
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [environment, setEnvironment] = useState('QA');
  const [browsers, setBrowsers] = useState<Browser[]>(['chromium']);
  const [testingType, setTestingType] = useState<TestingType>(null);
  const [roles, setRoles] = useState<RoleForm[]>([{ name: 'Default', username: '', password: '', saved: null }]);
  const [urlCheck, setUrlCheck] = useState<{ state: 'idle' | 'checking' | 'ok' | 'bad'; text: string }>({ state: 'idle', text: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<Source[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // load the saved project into the form once
  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setUrl(project.url);
    setEnvironment(project.environment);
    setBrowsers(project.browsers);
    setTestingType(project.testingType ?? null);
    setRoles(project.roles.map((r) => ({ name: r.name, username: '', password: '', saved: r.credentials })));
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const disabled = !canControl;
  const sources = [...(project?.sources ?? []), ...pending];

  const checkUrl = async () => {
    if (!url.trim()) return;
    setUrlCheck({ state: 'checking', text: 'Checking from this PC…' });
    try {
      const r = await setupApi.checkUrl(url.trim());
      setUrlCheck(r.reachable
        ? { state: 'ok', text: `Reachable · HTTP ${r.status} · ${r.ms} ms${r.finalUrl && r.finalUrl !== url.trim() ? ` · redirects to ${new URL(r.finalUrl).host}` : ''}` }
        : { state: 'bad', text: `Not reachable: ${r.status ? `HTTP ${r.status}` : r.error}` });
    } catch (e) {
      setUrlCheck({ state: 'bad', text: (e as Error).message });
    }
  };

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const saved = await setupApi.save({
        id: fresh ? undefined : project?.id,
        name: name.trim(),
        url: url.trim(),
        environment: environment.trim(),
        browsers,
        testingType,
        roles: roles.map((r) => ({ name: r.name, username: r.username || undefined, password: r.password || undefined })),
      });
      if (fresh) {
        // a new project: show it (every page remounts with its data) and continue on its Setup
        goSetup();
        selectProject(saved.id, canControl);
        return;
      }
      setProject(saved);
      setRoles(saved.roles.map((r) => ({ name: r.name, username: '', password: '', saved: r.credentials })));
      setSavedAt(Date.now());
      setUrlCheck({ state: 'ok', text: 'Reachable (checked on save)' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const refresh = (updater: (p: Project) => Project) => setProject((p) => (p ? updater(p) : p));

  const upload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const temp: Source = { id: `pending-${file.name}-${Date.now()}`, kind: 'file', type: file.name.split('.').pop() ?? '', name: file.name, size: file.size, status: 'parsing', detail: null, addedAt: '' };
      setPending((p) => [...p, temp]);
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error('Larger than 25 MB');
        const added = await setupApi.addFile(file.name, await readBase64(file));
        refresh((p) => ({ ...p, sources: [...p.sources, added] }));
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      } finally {
        setPending((p) => p.filter((x) => x.id !== temp.id));
      }
    }
  };

  const addLink = async () => {
    const value = link.trim();
    if (!value) return;
    const temp: Source = { id: `pending-link-${Date.now()}`, kind: 'link', type: 'link', name: value, size: null, status: 'fetching', detail: null, addedAt: '' };
    setPending((p) => [...p, temp]);
    setLink('');
    try {
      const added = await setupApi.addLink(value);
      refresh((p) => ({ ...p, sources: [...p.sources, added] }));
    } catch (e) {
      setError((e as Error).message);
      setLink(value);
    } finally {
      setPending((p) => p.filter((x) => x.id !== temp.id));
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    try {
      const added = await setupApi.addNote(note);
      refresh((p) => ({ ...p, sources: [...p.sources, added] }));
      setNote('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (s: Source) => {
    try {
      await setupApi.remove(s.id);
      refresh((p) => ({ ...p, sources: p.sources.filter((x) => x.id !== s.id) }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (project === undefined) return <p className="py-20 text-center text-[13px] text-ink-3">Loading project…</p>;

  const dirty = !project || name !== project.name || url !== project.url || environment !== project.environment || browsers.join() !== project.browsers.join()
    || testingType !== (project.testingType ?? null)
    || roles.some((r) => r.username || r.password) || roles.map((r) => r.name).join() !== project.roles.map((r) => r.name).join();
  const byStatus = (st: Source['status'][]) => (project?.sources ?? []).filter((s) => st.includes(s.status)).length;
  const missingCreds = project?.roles.filter((r) => !r.credentials.username || !r.credentials.password) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onMenu} aria-label="Open navigation" className="grid size-9 place-items-center rounded-full border border-line text-ink-2 lg:hidden"><Menu size={16} /></button>
          {fresh && openProject ? (
            <button onClick={goSetup} className="flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Back to {openProject.name}</button>
          ) : project && <button onClick={goDashboard} className="flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Dashboard</button>}
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
        <div>
          <h1 className="text-[30px] font-light leading-tight tracking-[-0.01em] text-ink sm:text-[36px]">{fresh ? 'Add a new project' : project ? `Project Setup · ${project.name}` : 'Set up your project'}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Tell TestNova what to test and what it should know. The AI Pipeline reads every source, explores the application, and builds the test plan, automation and reports from it.
          </p>
          {fresh && openProject && (
            <p className="mt-2 max-w-2xl text-[12.5px] text-ink-2">
              The new project gets its own AI Pipeline, run from the first stage, and its own modules, executions, defects and reports. <span className="text-ink">{openProject.name}</span> keeps its configuration, history and results unchanged.
            </p>
          )}
          {!canControl && <p className="mt-2 text-[12.5px] text-warn">View only: setup can only be changed on the PC hosting TestNova.</p>}
        </div>
      </motion.header>

      <ProjectList fresh={fresh} />

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-12">
        <div className="flex flex-col gap-4 2xl:col-span-7">
          <Card delay={0.1} className="p-5" label="Application">
            <CardTitle right={<Globe size={15} className="text-ink-3" />}>Application</CardTitle>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Project name">
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customer Portal" disabled={disabled} />
              </Field>
              <Field label="Environment" hint="Shown as the environment on every run and report">
                <input className={input} value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="QA, Staging, UAT…" disabled={disabled} />
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Application URL"
                  error={urlCheck.state === 'bad' ? urlCheck.text : null}
                  hint={urlCheck.state === 'ok' ? <span className="text-good">{urlCheck.text}</span> : urlCheck.state === 'checking' ? urlCheck.text : 'Checked for reachability from this PC before it is saved'}
                >
                  <div className="flex gap-2">
                    <input className={input} value={url} onChange={(e) => { setUrl(e.target.value); setUrlCheck({ state: 'idle', text: '' }); }} onBlur={checkUrl} placeholder="https://qa.example.com" inputMode="url" disabled={disabled} />
                    <button onClick={checkUrl} disabled={disabled || !url.trim() || urlCheck.state === 'checking'} className="shrink-0 rounded-xl border border-line-2 px-3 text-[12.5px] text-ink-2 hover:text-ink disabled:opacity-40">
                      {urlCheck.state === 'checking' ? <Loader2 size={14} className="animate-spin" /> : 'Check'}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[12px] text-ink-2">Browsers to test</span>
                <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Browsers to test">
                  {BROWSERS.map((b) => {
                    const on = browsers.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        role="checkbox"
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => setBrowsers((list) => (on ? list.filter((x) => x !== b.id) : [...list, b.id]))}
                        className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition ${on ? 'border-lilac/50 bg-lilac/15 text-ink shadow-[0_0_12px_rgb(169_156_255/0.2)]' : 'border-line text-ink-3 hover:text-ink-2'}`}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <Card delay={0.15} className="p-5" label="Testing type">
            <fieldset disabled={disabled} className="min-w-0">
              <legend className="contents">
                <CardTitle right={<span className="text-[11.5px] text-ink-3">One per pipeline run</span>}>Testing type</CardTitle>
              </legend>
              <p className="mt-1 text-[12px] text-ink-3">
                Choose what the AI Pipeline tests. A focused type runs only its own dedicated agents and checks, so the run is shorter.
                {project && ' Changing it on a project that has already run switches the next run: stages 3–8 run again for the new type, and their current outputs are archived.'}
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {testingTypes.map((o) => {
                  const info = typeInfo(o.key);
                  const Icon = info.icon;
                  const on = testingType === o.key;
                  const id = `testing-type-${o.key ?? 'full'}`;
                  return (
                    <label
                      key={id}
                      htmlFor={id}
                      className={`flex items-start gap-3 rounded-2xl border p-3 transition ${!o.available ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${on ? 'border-lilac/50 bg-lilac/10 shadow-[0_0_12px_rgb(169_156_255/0.15)]' : 'border-line bg-white/[0.02] hover:border-line-2'}`}
                    >
                      <input
                        id={id}
                        type="radio"
                        name="testing-type"
                        className="mt-1 accent-[#a99cff]"
                        checked={on}
                        disabled={!o.available}
                        onChange={() => setTestingType(o.key)}
                        aria-describedby={`${id}-text`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px] text-ink"><Icon size={14} className="text-lilac" aria-hidden /> {o.label}</span>
                        <span id={`${id}-text`} className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">
                          {info.text}
                          {!o.available && <span className="mt-1 block text-warn">Available once it has been validated.</span>}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Card>

          <Card delay={0.2} className="p-5" label="Test login">
            <CardTitle right={<span className="flex items-center gap-1.5 text-[11.5px] text-ink-3"><Lock size={12} /> Stored in this project's .env on this PC only</span>}>Test login</CardTitle>
            <p className="mt-1 text-[12px] text-ink-3">Never written to the project file, logs, reports or the cloud. Leave a password empty to keep the saved one.</p>
            <ul className="mt-4 flex flex-col gap-3">
              {roles.map((r, i) => (
                <li key={i} className="grid grid-cols-1 gap-2 rounded-2xl border border-line bg-white/[0.02] p-3 sm:grid-cols-[1fr_1.2fr_1.2fr_auto] sm:items-end">
                  <Field label={i === 0 ? 'Role (default)' : 'Role'}>
                    <input className={input} value={r.name} disabled={disabled} onChange={(e) => setRoles((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </Field>
                  <Field label="Username">
                    <input className={input} value={r.username} disabled={disabled} autoComplete="off" placeholder={r.saved?.username ? `${r.saved.hint ?? 'saved'} (saved)` : 'username or email'} onChange={(e) => setRoles((rs) => rs.map((x, j) => (j === i ? { ...x, username: e.target.value } : x)))} />
                  </Field>
                  <Field label="Password">
                    <PasswordInput
                      value={r.password}
                      disabled={disabled}
                      label={`password for ${r.name || 'this role'}`}
                      placeholder={r.saved?.password ? '•••••••• (saved)' : 'password'}
                      onChange={(v) => setRoles((rs) => rs.map((x, j) => (j === i ? { ...x, password: v } : x)))}
                    />
                  </Field>
                  <button
                    onClick={() => setRoles((rs) => rs.filter((_, j) => j !== i))}
                    disabled={disabled || i === 0}
                    aria-label={`Remove role ${r.name}`}
                    className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-white/[0.06] hover:text-bad disabled:invisible"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => setRoles((rs) => [...rs, { name: `Role ${rs.length + 1}`, username: '', password: '', saved: null }])} disabled={disabled} className="mt-3 flex items-center gap-1.5 text-[12.5px] text-lilac hover:text-ink disabled:opacity-40">
              <Plus size={14} /> Add a role
            </button>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <motion.button
              whileHover={disabled ? undefined : { scale: 1.02 }}
              whileTap={disabled ? undefined : { scale: 0.98 }}
              onClick={save}
              disabled={disabled || saving || !name.trim() || !url.trim() || !browsers.length}
              className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-[#111] disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {fresh ? 'Create project' : project ? 'Save changes' : 'Save project'}
            </motion.button>
            {!dirty && savedAt && <span className="flex items-center gap-1.5 text-[12.5px] text-good"><CheckCircle2 size={14} /> Saved</span>}
            {dirty && project && <span className="text-[12.5px] text-warn">Unsaved changes</span>}
          </div>
          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-[12.5px] text-ink">
                <CircleAlert size={14} className="mt-0.5 shrink-0 text-bad" /> <span className="flex-1">{error}</span>
                <button onClick={() => setError('')} aria-label="Dismiss" className="text-ink-3 hover:text-ink"><X size={13} /></button>
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-4 2xl:col-span-5">
          <Card delay={0.3} className="p-5" label="Knowledge sources">
            <CardTitle right={<span className="text-[11.5px] text-ink-3">{sources.length} source{sources.length === 1 ? '' : 's'}</span>}>Knowledge sources</CardTitle>
            {!project ? (
              <p className="mt-4 rounded-xl border border-line bg-white/[0.02] px-3 py-6 text-center text-[12.5px] text-ink-3">Save the project first, then add user stories, test cases, requirement docs, links and notes.</p>
            ) : (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload files"
                  onClick={() => !disabled && fileInput.current?.click()}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && fileInput.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled && e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
                  className={`mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-7 text-center transition ${dragging ? 'border-lilac/70 bg-lilac/10' : 'border-line-2 bg-white/[0.02] hover:border-lilac/40'} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <span className="grid size-10 place-items-center rounded-full border border-lilac/30 bg-lilac/15 text-lilac"><Upload size={17} /></span>
                  <p className="text-[13px] text-ink">Drop files here, or click to browse</p>
                  <p className="text-[11.5px] text-ink-3">User stories, test cases, requirement docs · .pdf .docx .xlsx .csv .md .txt, images · up to 25 MB</p>
                  <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
                </div>

                <div className="mt-4 flex gap-2">
                  <input className={input} value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} placeholder="Link: help centre, docs, Confluence, Figma…" disabled={disabled} />
                  <button onClick={addLink} disabled={disabled || !link.trim()} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line-2 px-3 text-[12.5px] text-ink-2 hover:text-ink disabled:opacity-40"><Link2 size={13} /> Add</button>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-3">Public pages are fetched now. Pages behind a login are kept as "not readable" and listed as gaps.</p>

                <div className="mt-4 flex flex-col gap-2">
                  <textarea className={`${input} min-h-[76px] resize-y`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={'Notes for the AI: "payments need OTP", "don\'t delete real data", modules to skip…'} disabled={disabled} />
                  <button onClick={addNote} disabled={disabled || !note.trim()} className="flex items-center gap-1.5 self-end rounded-xl border border-line-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:text-ink disabled:opacity-40"><NotebookPen size={13} /> Add note</button>
                </div>

                <ul className="mt-4 flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {sources.map((s) => (
                      <SourceChip key={s.id} s={s} disabled={disabled || s.id.startsWith('pending-')} onRemove={() => remove(s)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </>
            )}
          </Card>

          {project && (
            <Card delay={0.4} glow className="p-5" label="Summary">
              <CardTitle right={<KeyRound size={15} className="text-ink-3" />}>Summary</CardTitle>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[12.5px]">
                <dt className="text-ink-3">Project</dt><dd className="text-ink">{project.name}</dd>
                <dt className="text-ink-3">URL</dt><dd className="truncate text-ink">{project.url}</dd>
                <dt className="text-ink-3">Environment</dt><dd className="text-ink">{project.environment}</dd>
                <dt className="text-ink-3">Browsers</dt><dd className="text-ink">{project.browsers.map((b) => BROWSERS.find((x) => x.id === b)?.label).join(', ')}</dd>
                <dt className="text-ink-3">Testing type</dt><dd className="text-ink">{typeLabel(testingTypes, project.testingType ?? null)}</dd>
                <dt className="text-ink-3">Roles</dt>
                <dd className="text-ink">
                  {project.roles.map((r) => (
                    <span key={r.key} className="mr-3 inline-flex items-center gap-1">
                      {r.credentials.username && r.credentials.password ? <CheckCircle2 size={12} className="text-good" /> : <CircleAlert size={12} className="text-warn" />}
                      {r.name}
                    </span>
                  ))}
                </dd>
                <dt className="text-ink-3">Sources</dt>
                <dd className="text-ink">
                  {project.sources.length} · {byStatus(['parsed', 'fetched', 'saved'])} ready
                  {byStatus(['not-readable']) > 0 && <span className="text-warn"> · {byStatus(['not-readable'])} not readable</span>}
                  {byStatus(['failed']) > 0 && <span className="text-bad"> · {byStatus(['failed'])} failed</span>}
                </dd>
              </dl>
              {missingCreds.length > 0 && (
                <p className="mt-3 text-[12px] text-warn">No login saved for {missingCreds.map((r) => r.name).join(', ')}: the agents can only explore what is public.</p>
              )}
              <motion.button
                whileHover={disabled || dirty ? undefined : { scale: 1.02 }}
                whileTap={disabled || dirty ? undefined : { scale: 0.98 }}
                onClick={() => setConfirm(true)}
                disabled={disabled || dirty}
                title={dirty ? 'Save your changes first' : undefined}
                className="cta-gradient keep-dark mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-3 text-[13.5px] font-medium text-white shadow-[0_20px_60px_-20px_rgb(74_98_255/0.6)] disabled:opacity-40"
              >
                <Rocket size={15} /> Start AI Pipeline
              </motion.button>
            </Card>
          )}
        </div>
      </div>

      <AnimatePresence>{confirm && project && <StartDialog project={project} typeName={typeLabel(testingTypes, project.testingType ?? null)} onClose={() => setConfirm(false)} />}</AnimatePresence>
    </div>
  );
}

function StartDialog({ project, typeName, onClose }: { project: Project; typeName: string; onClose: () => void }) {
  const [review, setReview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const typed = Boolean(project.testingType);
  // Security Testing: the operator confirms the authorization before the run starts
  const security = project.testingType === 'security';
  const [authorized, setAuthorized] = useState(false);
  const [reference, setReference] = useState('');
  // the pipeline ran under another testing type: the server explains the switch, the user confirms it
  const [switchNeeded, setSwitchNeeded] = useState(false);
  const start = async () => {
    setBusy(true);
    setError('');
    try {
      await pipelineApi.start(review, {
        switchTestingType: switchNeeded,
        securityAuthorization: security ? { confirmed: authorized, reference: reference.trim() } : undefined,
      });
      goPipeline();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TESTING_TYPE_CHANGED') setSwitchNeeded(true);
      setError(e instanceof ApiError && e.code === 'AUTHORIZATION_REQUIRED' ? 'Tick the authorization confirmation to start Security Testing.' : (e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div role="alertdialog" aria-label="Start the AI Pipeline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="fixed left-1/2 top-[16%] z-50 w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 rounded-[22px] border border-line-2 bg-panel p-6">
        <h2 className="text-[16px] text-ink">Start the AI Pipeline for {project.name}?</h2>
        <p className="mt-2 text-[12.5px] text-ink-2">Testing type: <span className="text-ink">{typeName}</span></p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          Eight AI agents run one after another against <span className="text-ink">{project.url}</span>: they read your sources, explore the application in a real browser, write the knowledge base, test plans, automation and reports.
          {typed ? ` The planning and testing agents are dedicated to ${typeName.toLowerCase()} and follow its standard, so they plan and run only those checks.` : ''} This can take a long time and uses Claude usage. You can stop it at any point.
        </p>
        <p className="mt-2 text-[12px] text-ink-3">The agents sign in with the saved test logins and follow your notes (for example, modules to skip or data not to delete).</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white/[0.02] p-3">
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} className="mt-0.5 accent-[#a99cff]" />
          <span className="text-[12.5px] text-ink-2"><span className="text-ink">Pause for my review</span> after the knowledge base, the test plans and the exploratory testing, so I can check or edit them before the pipeline continues. At the knowledge-base review you can also choose which modules to test.</span>
        </label>
        {security && (
          <div className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} className="mt-0.5 accent-[#a99cff]" />
              <span className="text-[12.5px] text-ink-2">
                <span className="text-ink">I am authorized</span> to run safe, non-destructive security tests against <span className="text-ink">{project.url}</span> in the <span className="text-ink">{project.environment}</span> environment, which is not production.
              </span>
            </label>
            <label className="mt-2 flex flex-col gap-1 text-[12px] text-ink-2">
              Authorization reference (optional)
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. an approval email or ticket id" className="rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-lilac/50" />
            </label>
            <p className="mt-2 text-[11.5px] text-ink-3">Recorded with the run and shown in the report. Only the application's own origin is tested; no scanners, brute force or load.</p>
          </div>
        )}
        {error && <p role="alert" className={`mt-3 rounded-xl border px-3 py-2 text-[12.5px] text-ink ${switchNeeded ? 'border-warn/40 bg-warn/10' : 'border-bad/40 bg-bad/10'}`}>{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-line-2 px-4 py-1.5 text-[13px] text-ink">Cancel</button>
          <button onClick={start} disabled={busy || (security && !authorized)} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-[#111] disabled:opacity-50">
            {busy && <Loader2 size={13} className="animate-spin" />} {switchNeeded ? `Switch to ${typeName} and start` : 'Start pipeline'}
          </button>
        </div>
      </motion.div>
    </>
  );
}
