import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronsUpDown, FolderKanban, Plus } from 'lucide-react';
import { EASE_OUT } from '../theme';
import { currentProjectId, selectProject, type ProjectSummary } from '../data/projects';
import type { PipelineStatus } from '../data/setup';
import { goDashboard, goNewProject } from '../lib/router';

export const PIPELINE_LABEL: Record<PipelineStatus, { cls: string; label: string }> = {
  idle: { cls: 'bg-ink-3', label: 'Pipeline not started' },
  running: { cls: 'bg-electric live-dot', label: 'Pipeline running' },
  paused: { cls: 'bg-warn', label: 'Waiting for review' },
  failed: { cls: 'bg-bad', label: 'Pipeline failed' },
  stopped: { cls: 'bg-bad/70', label: 'Pipeline stopped' },
  completed: { cls: 'bg-good', label: 'Pipeline completed' },
};

/**
 * The project on screen, and the way to every other one. Picking a project reloads every page with
 * that project's data; "New project" opens an empty Setup form.
 */
export function ProjectSwitcher({
  projects, canControl, collapsed, onExpand, onNavigate,
}: {
  projects: ProjectSummary[] | null;
  canControl: boolean;
  collapsed: boolean;
  onExpand: () => void;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const currentId = currentProjectId();
  const current = projects?.find((p) => p.id === currentId) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (collapsed) {
    return (
      <button
        onClick={onExpand}
        title={current ? `Project: ${current.name}` : 'No project'}
        aria-label={current ? `Project: ${current.name}. Expand navigation to switch` : 'No project'}
        className="mx-auto mb-3 grid size-9 place-items-center rounded-full border border-lilac/30 bg-lilac/15 text-[13px] font-medium uppercase text-lilac"
      >
        {current?.name.slice(0, 1) ?? <FolderKanban size={15} />}
      </button>
    );
  }

  const pick = (id: string) => {
    setOpen(false);
    onNavigate?.();
    if (id !== currentId) {
      goDashboard();
      selectProject(id, canControl);
    }
  };

  return (
    <div ref={box} className="relative mb-3 px-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-white/[0.03] p-2 text-left transition hover:border-line-2"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-lilac/30 bg-lilac/15 text-[13px] font-medium uppercase text-lilac">
          {current?.name.slice(0, 1) ?? <FolderKanban size={14} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Project</span>
          <span className="block truncate text-[13px] text-ink">{current?.name ?? (projects?.length ? 'Pick a project' : 'No project yet')}</span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-ink-3" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="absolute inset-x-1 top-full z-50 mt-2 rounded-2xl border border-line-2 bg-panel p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)]"
          >
            <ul role="listbox" aria-label="Projects" className="max-h-[300px] overflow-y-auto">
              {(projects ?? []).map((p) => {
                const dot = PIPELINE_LABEL[p.pipeline.status] ?? PIPELINE_LABEL.idle;
                return (
                  <li key={p.id}>
                    <button
                      role="option"
                      aria-selected={p.id === currentId}
                      onClick={() => pick(p.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.06]"
                    >
                      <span title={dot.label} className={`size-2 shrink-0 rounded-full ${dot.cls}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-ink">{p.name}</span>
                        <span className="block truncate text-[11px] text-ink-3">{p.tests ? `${p.tests} tests · ${p.modules} modules` : dot.label}</span>
                      </span>
                      {p.id === currentId && <Check size={14} className="shrink-0 text-lilac" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="my-1 h-px bg-line" />
            <button
              onClick={() => {
                setOpen(false);
                onNavigate?.();
                goNewProject();
              }}
              disabled={!canControl}
              title={canControl ? undefined : 'Projects can only be added on the PC hosting TestNova'}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] text-lilac hover:bg-white/[0.06] disabled:opacity-40"
            >
              <Plus size={14} /> New project
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
