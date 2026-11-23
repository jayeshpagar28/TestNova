import { motion } from 'motion/react';
import { ArrowRight, FolderKanban, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Card, CardTitle } from '../Card';
import { PIPELINE_LABEL } from '../ProjectSwitcher';
import { currentProjectId, deleteProject, projectsChanged, selectProject, setCurrentProjectId, useProjects } from '../../data/projects';
import type { ProjectSummary } from '../../data/projects';
import { goNewProject, goSetup } from '../../lib/router';
import { dateTime } from '../../lib/format';

/**
 * Every project TestNova holds. Each has its own pipeline, modules, executions, defects and reports;
 * opening one switches every page to it. Adding a project never changes an existing one, and
 * deleting one never touches the others.
 */
export function ProjectList({ fresh }: { fresh: boolean }) {
  const { projects, canControl, reload } = useProjects();
  const [deleting, setDeleting] = useState('');
  const [error, setError] = useState('');
  const currentId = currentProjectId();
  if (!projects?.length) return null;
  const current = projects.find((p) => p.id === currentId);
  const canAdd = canControl && !fresh;

  const remove = async (p: ProjectSummary) => {
    setError('');
    if (p.running || p.pipeline.status === 'running') {
      setError(`${p.name} is running (pipeline or execution). Stop it before deleting the project.`);
      return;
    }
    const typed = window.prompt(
      `Delete the project "${p.name}"?\n\n`
        + `Its settings, knowledge sources, pipeline, ${p.tests} tests, ${p.executions} executions, defects and reports are removed from TestNova. `
        + 'The folder is moved to .testnova/deleted-projects/ on this PC, so it can still be restored by hand. Other projects are not affected.\n\n'
        + `Type the project name to confirm: ${p.name}`,
    );
    if (typed === null) return;
    if (typed.trim() !== p.name) {
      setError(`The name did not match, so ${p.name} was not deleted.`);
      return;
    }
    setDeleting(p.id);
    try {
      const { active } = await deleteProject(p.id, typed.trim());
      // the page was showing the deleted project: switch to the server's new default (or none)
      if (p.id === currentId) {
        setCurrentProjectId(active);
        if (active) selectProject(active, canControl);
        goSetup();
      }
      projectsChanged();
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting('');
    }
  };

  return (
    <Card delay={0.05} className="p-5" label="Projects">
      <CardTitle
        right={
          <button
            onClick={goNewProject}
            disabled={!canAdd}
            title={!canControl ? 'Projects can only be added on the PC hosting TestNova' : fresh ? 'Fill in the form below' : undefined}
            className="flex items-center gap-1.5 rounded-full border border-lilac/40 bg-lilac/10 px-3 py-1.5 text-[12.5px] text-ink hover:bg-lilac/20 disabled:opacity-40"
          >
            <Plus size={13} /> Add another project
          </button>
        }
      >
        Projects <span className="text-ink-3">{projects.length}</span>
      </CardTitle>
      {current?.pipeline.status === 'completed' && !fresh && (
        <p className="mt-1 text-[12px] text-ink-3">
          {current.name}'s pipeline has completed. Add another application to run the same pipeline on it, from the first stage, without touching {current.name}.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-[12px] text-bad">{error}</p>}
      <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {projects.map((p, i) => {
          const dot = PIPELINE_LABEL[p.pipeline.status] ?? PIPELINE_LABEL.idle;
          const here = p.id === currentId && !fresh;
          const busy = p.running || p.pipeline.status === 'running';
          return (
            <motion.li key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="group relative">
              <button
                onClick={() => {
                  if (p.id === currentId) return goSetup();
                  goSetup();
                  selectProject(p.id, canControl);
                }}
                aria-current={here ? 'true' : undefined}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3 pr-10 text-left transition ${here ? 'border-lilac/50 bg-lilac/10' : 'border-line bg-white/[0.02] hover:border-line-2'}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-lilac/30 bg-lilac/15 text-lilac"><FolderKanban size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] text-ink">{p.name}</span>
                    {here && <span className="shrink-0 rounded-full border border-lilac/40 px-1.5 text-[10px] text-lilac">Open</span>}
                    {p.running && <span className="shrink-0 rounded-full border border-electric/40 px-1.5 text-[10px] text-electric">Executing</span>}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-3">{p.url} · {p.environment}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
                    <span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${dot.cls}`} />{dot.label}{p.pipeline.status !== 'completed' && p.pipeline.passed ? ` · ${p.pipeline.passed}/8` : ''}</span>
                    <span>{p.tests} tests</span>
                    <span>{p.executions} executions</span>
                    {p.lastRun && <span>last {dateTime(new Date(p.lastRun))}</span>}
                  </span>
                </span>
                {!here && <ArrowRight size={14} className="mt-1 shrink-0 text-ink-3" />}
              </button>
              {canControl && (
                <button
                  onClick={() => remove(p)}
                  disabled={!!deleting || busy}
                  aria-label={`Delete project ${p.name}`}
                  title={busy ? 'Stop its pipeline or execution before deleting' : `Delete ${p.name}`}
                  className="absolute bottom-2.5 right-2.5 grid size-7 place-items-center rounded-full text-ink-3 opacity-60 transition hover:bg-bad/15 hover:text-bad hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {deleting === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              )}
            </motion.li>
          );
        })}
      </ul>
    </Card>
  );
}
