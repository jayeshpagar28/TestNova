import { motion } from 'motion/react';
import { FolderKanban, Info, LayoutGrid, Menu, Play, Search, Square } from 'lucide-react';
import { EASE_OUT } from '../theme';
import { dateTime } from '../lib/format';
import { ConsolidatedReport } from './ConsolidatedReport';
import { ThemeToggle } from './ThemeToggle';

export function Topbar({
  project,
  build,
  device,
  lastRun,
  sample,
  running,
  blocked,
  onRun,
  onMenu,
}: {
  /** the project these results belong to */
  project: string | null;
  build: { version: string | null; code: string | null };
  device: { id: string | null; online: boolean };
  lastRun: Date | null;
  sample: boolean;
  running: boolean;
  /** why Run Regression cannot be used here, if it cannot */
  blocked: string | null;
  onRun: () => void;
  onMenu: () => void;
}) {
  return (
    <header className="flex flex-col gap-5">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT }}
        className="flex items-center gap-3"
      >
        <button onClick={onMenu} aria-label="Open navigation" className="grid size-9 place-items-center rounded-full border border-line text-ink-2 lg:hidden">
          <Menu size={16} />
        </button>
        <div className="flex items-center gap-2 text-[15px] text-ink">
          <LayoutGrid size={16} strokeWidth={1.6} className="text-ink-2" aria-hidden /> Dashboard
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <label className="hidden h-10 w-[300px] items-center gap-2 rounded-full border border-line bg-white/[0.03] pl-3.5 pr-1.5 text-ink-3 focus-within:border-line-2 md:flex">
            <Search size={15} aria-hidden />
            <input
              placeholder="Search tests, modules, defects"
              aria-label="Search tests, modules, defects"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
            <kbd className="flex items-center gap-1 rounded-full border border-line bg-white/[0.04] px-2.5 py-1 font-sans text-[11px] text-ink-2">
              Ctrl <span className="text-ink-3">+</span> K
            </kbd>
          </label>
          <motion.button
            whileHover={blocked ? undefined : { scale: 1.03 }}
            whileTap={blocked ? undefined : { scale: 0.97 }}
            onClick={onRun}
            disabled={Boolean(blocked)}
            title={blocked ?? undefined}
            className={`flex h-10 items-center gap-2 rounded-full px-5 text-[13px] font-medium shadow-[0_0_24px_rgb(255_255_255/0.15)] disabled:cursor-not-allowed disabled:opacity-40 ${
              running ? 'border border-line-2 bg-white/[0.06] text-ink' : 'bg-white text-[#111]'
            }`}
          >
            {running ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            {running ? 'Stop regression' : 'Run Regression'}
          </motion.button>
        </div>
      </motion.div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, delay: 0.15, ease: EASE_OUT }}
            className="text-[34px] font-light leading-tight tracking-[-0.01em] text-ink sm:text-[40px]"
          >
            Live automation intelligence.
          </motion.h1>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.45 }}
            className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-2"
          >
            {project && (
              <span className="flex items-center gap-1.5">
                <FolderKanban size={13} className="text-lilac" aria-hidden /> Project <span className="text-ink">{project}</span>
              </span>
            )}
            <span>
              Environment <span className="text-ink">{build.version ?? '—'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`live-dot size-1.5 rounded-full ${device.online ? 'bg-good' : 'bg-bad'}`} />
              {device.online ? <><span className="text-ink">{device.id}</span> · app reachable</> : device.id ? <>{device.id} · app not reachable</> : 'No project configured'}
            </span>
            <span>
              {lastRun ? <>Last execution <span className="text-ink">{dateTime(lastRun)}</span></> : 'No executions yet'}
            </span>
            {sample && (
              <span
                title="The TestNova server is not reachable, so no results can be shown. Start it with npm run dashboard."
                className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-[11px] text-warn"
              >
                Server offline
              </span>
            )}
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex items-center gap-2">
          <ConsolidatedReport />
          <button className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-2 hover:text-ink">
            <Info size={13} /> How it works
          </button>
        </motion.div>
      </div>
    </header>
  );
}
