import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bug, ChevronDown, ChevronLeft, FileBarChart2, History, LayoutGrid, Play, Repeat2, Settings, Boxes, type LucideIcon, Square, SlidersHorizontal, Workflow } from 'lucide-react';
import type { PipelineStatus } from '../data/setup';
import type { ModuleSummary } from '../data/model';
import { EASE_OUT } from '../theme';
import { ModuleIcon } from './ModuleIcon';
import { ProjectSwitcher } from './ProjectSwitcher';
import type { ProjectSummary } from '../data/projects';
import { goDashboard, goModule, goPipeline, goRegression, goReport, goSetup, type Route } from '../lib/router';

export function Logo({ compact = false }: { compact?: boolean }) {
  // One id per logo: the desktop rail is display:none on a phone, and a gradient referenced from
  // inside a hidden SVG paints nothing, so the drawer's logo needs its own.
  const gradient = useId();
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9DBBFF" />
            <stop offset="1" stopColor="#2F7BFF" />
          </linearGradient>
        </defs>
        <path d="M16 2c1.2 7 3.6 10.6 14 14-10.4 3.4-12.8 7-14 14-1.2-7-3.6-10.6-14-14C12.4 12.6 14.8 9 16 2z" fill={`url(#${gradient})`} />
        <circle cx="16" cy="16" r="2.4" fill="#fff" />
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="text-[17px] font-medium tracking-[0.22em] text-ink">
            TEST<span className="text-lilac">NOVA</span>
          </div>
        </div>
      )}
    </div>
  );
}

type NavId = 'dashboard' | 'setup' | 'pipeline' | 'modules' | 'regression' | 'history' | 'defects' | 'reports' | 'settings';
const PRIMARY: { id: NavId; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'setup', label: 'Project Setup', icon: SlidersHorizontal },
  { id: 'pipeline', label: 'AI Pipeline', icon: Workflow },
  { id: 'modules', label: 'Modules', icon: Boxes },
  { id: 'regression', label: 'Regression Testing', icon: Repeat2 },
  { id: 'history', label: 'Execution History', icon: History },
  { id: 'defects', label: 'Defect Register', icon: Bug },
];
const SECONDARY: { id: NavId; label: string; icon: LucideIcon }[] = [
  { id: 'reports', label: 'QA Report', icon: FileBarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

/** The AI Pipeline entry's dot: what the pipeline is doing now. */
const PIPELINE_DOT: Record<PipelineStatus, { cls: string; label: string }> = {
  idle: { cls: 'bg-ink-3', label: 'Not started' },
  running: { cls: 'bg-electric live-dot', label: 'Running' },
  paused: { cls: 'bg-warn', label: 'Waiting for your review' },
  failed: { cls: 'bg-bad', label: 'Failed' },
  stopped: { cls: 'bg-bad/70', label: 'Stopped' },
  completed: { cls: 'bg-good', label: 'Completed' },
};

function NavItem({
  label, icon: Icon, active, collapsed, onClick, trailing,
}: { label: string; icon: LucideIcon; active?: boolean; collapsed: boolean; onClick?: () => void; trailing?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex w-full items-center gap-3 rounded-2xl p-1.5 pr-3 text-left text-[13.5px] transition-colors ${
        active ? 'text-ink' : 'text-ink-2 hover:text-ink'
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/[0.09] to-white/[0.02] shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <span
        className={`relative grid size-9 shrink-0 place-items-center rounded-full border transition-colors ${
          active ? 'border-lilac/30 bg-lilac/15 text-lilac' : 'border-line bg-white/[0.03] group-hover:border-line-2'
        }`}
      >
        <Icon size={16} strokeWidth={1.6} aria-hidden />
      </span>
      {!collapsed && <span className="relative flex-1 truncate">{label}</span>}
      {!collapsed && trailing}
    </button>
  );
}

export function Sidebar({
  modules,
  collapsed,
  onToggle,
  onRunRegression,
  regressionRunning = false,
  route,
  onNavigate,
  pipelineStatus = null,
  projects = null,
  canControlProjects = false,
}: {
  /** every project, for the switcher; null while loading */
  projects?: ProjectSummary[] | null;
  canControlProjects?: boolean;
  /** null: no project yet, so no pipeline */
  pipelineStatus?: PipelineStatus | null;
  modules: Pick<ModuleSummary, 'id' | 'name' | 'icon'>[];
  collapsed: boolean;
  onToggle: () => void;
  onRunRegression: () => void;
  /** a full regression is in progress: the card offers to stop it instead */
  regressionRunning?: boolean;
  route: Route;
  /** Called after a choice is made, so the mobile drawer can close. */
  onNavigate?: () => void;
}) {
  // Pages that do not exist yet only move the highlight; the route decides everything else.
  const [picked, setPicked] = useState<NavId | null>(null);
  const active: NavId | string =
    route.page === 'module' ? route.id
      : route.page === 'regression' ? 'regression'
        : route.page === 'setup' ? 'setup'
          : route.page === 'pipeline' ? 'pipeline'
            : route.page === 'report' ? (route.tab === 'defects' ? 'defects' : 'reports')
              : (picked && !['regression', 'setup', 'pipeline', 'defects', 'reports'].includes(picked) ? picked : 'dashboard');
  const pick = (id: NavId) => {
    setPicked(id);
    if (id === 'dashboard') goDashboard();
    if (id === 'setup') goSetup();
    if (id === 'pipeline') goPipeline();
    if (id === 'regression') goRegression();
    if (id === 'defects') goReport('defects');
    if (id === 'reports') goReport();
    onNavigate?.();
  };
  const [open, setOpen] = useState(true);

  return (
    <motion.aside
      initial={{ opacity: 0, x: -28 }}
      animate={{ opacity: 1, x: 0, width: collapsed ? 84 : 264 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
      className="flex h-full flex-col gap-3"
      aria-label="Main navigation"
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-line bg-panel/90 p-3 backdrop-blur-xl">
        <div className={`flex items-center px-1.5 pb-4 pt-2 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <Logo compact={collapsed} />
          {!collapsed && (
            <button
              onClick={onToggle}
              aria-label="Collapse navigation"
              className="grid size-7 place-items-center rounded-full border border-line bg-white/[0.04] text-ink-2 hover:text-ink"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={onToggle}
            aria-label="Expand navigation"
            className="mx-auto mb-3 grid size-7 place-items-center rounded-full border border-line bg-white/[0.04] text-ink-2 hover:text-ink"
          >
            <ChevronLeft size={14} className="rotate-180" />
          </button>
        )}
        <ProjectSwitcher projects={projects} canControl={canControlProjects} collapsed={collapsed} onExpand={onToggle} onNavigate={onNavigate} />

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto no-scrollbar">
          {PRIMARY.map((item) =>
            item.id === 'modules' ? (
              <div key={item.id}>
                <NavItem
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                  active={active === 'modules'}
                  onClick={() => (collapsed ? onToggle() : setOpen((o) => !o))}
                  trailing={
                    <ChevronDown size={14} className={`relative text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} />
                  }
                />
                <AnimatePresence initial={false}>
                  {open && !collapsed && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: EASE_OUT }}
                      className="relative ml-[29px] max-h-[236px] overflow-y-auto overflow-x-hidden pr-1"
                    >
                      {/* the tree's trunk, as in the reference's BONUSES / TOOLS / RESEARCH branch */}
                      <span className="absolute bottom-3 left-0 top-0 w-px bg-white/10" aria-hidden />
                      {modules.map((m) => (
                        <li key={m.id} className="relative">
                          <span className="absolute left-0 top-1/2 h-px w-4 bg-white/10" aria-hidden />
                          <button
                            aria-current={active === m.id ? 'page' : undefined}
                            onClick={() => {
                              goModule(m.id);
                              onNavigate?.();
                            }}
                            className={`ml-6 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg px-2 py-[7px] text-left text-[12px] uppercase tracking-[0.06em] transition-colors ${
                              active === m.id ? 'bg-white/[0.06] text-ink' : 'text-ink-3 hover:text-ink-2'
                            }`}
                          >
                            <ModuleIcon name={m.icon} size={13} className="shrink-0 opacity-70" />
                            <span className="truncate">{m.name}</span>
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <NavItem
                key={item.id}
                label={item.label}
                icon={item.icon}
                collapsed={collapsed}
                active={active === item.id}
                onClick={() => pick(item.id)}
                trailing={
                  item.id === 'pipeline' && pipelineStatus ? (
                    <span title={PIPELINE_DOT[pipelineStatus].label} aria-label={`Pipeline: ${PIPELINE_DOT[pipelineStatus].label}`} className={`relative size-2 rounded-full ${PIPELINE_DOT[pipelineStatus].cls}`} />
                  ) : undefined
                }
              />
            ),
          )}
          <div className="my-2 h-px bg-line" />
          {SECONDARY.map((item) => (
            <NavItem
              key={item.id}
              label={item.label}
              icon={item.icon}
              collapsed={collapsed}
              active={active === item.id}
              onClick={() => pick(item.id)}
            />
          ))}
        </nav>
      </div>

      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 1.3, ease: EASE_OUT }}
          className="keep-dark cta-gradient relative overflow-hidden rounded-[22px] border border-white/10 p-4 shadow-[0_20px_60px_-20px_rgb(74_98_255/0.6)]"
        >
          <p className="text-[11.5px] text-ink-2">{regressionRunning ? 'Regression in progress' : 'New build landed?'}</p>
          <p className="mt-1 text-[19px] font-medium leading-snug text-white">
            {regressionRunning ? 'All modules are running in the browser' : 'Run the full regression in one move'}
          </p>
          <button
            onClick={onRunRegression}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] py-2.5 text-[13px] text-white backdrop-blur transition hover:bg-white/[0.14]"
          >
            {regressionRunning ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            {regressionRunning ? 'Stop regression' : 'Start regression'}
          </button>
        </motion.div>
      )}
    </motion.aside>
  );
}
