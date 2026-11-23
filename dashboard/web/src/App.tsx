import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCatalogue } from './data/catalogue';
import { useDashboard } from './data/live';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { KpiRow } from './components/KpiRow';
import { ModuleStrip } from './components/ModuleStrip';
import { TrendChart } from './components/TrendChart';
import { Leaderboard } from './components/Leaderboard';
import { CauseRose } from './components/CauseRose';
import { RegressionFlow } from './components/RegressionFlow';
import { RunSummary } from './components/RunSummary';
import { Intro } from './components/Intro';
import { ModulePage } from './components/module/ModulePage';
import { RegressionDialog } from './components/RegressionDialog';
import { RegressionPage } from './components/regression/RegressionPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { goPipeline, goRegression, goSetup, useRoute } from './lib/router';
import { SetupPage } from './components/setup/SetupPage';
import { PipelinePage } from './components/pipeline/PipelinePage';
import { ReportPage } from './components/report/ReportPage';
import { Card } from './components/Card';
import { Workflow } from 'lucide-react';
import { setupApi, usePipeline } from './data/setup';
import { currentProjectId, useProjects } from './data/projects';

/** The intro plays once per browser session; `?intro` in the URL forces it again. */
const INTRO_KEY = 'testnova:intro-seen';
const introWanted = () => new URLSearchParams(location.search).has('intro') || !sessionStorage.getItem(INTRO_KEY);

export default function App() {
  const [intro, setIntro] = useState(introWanted);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<'start' | 'stop' | null>(null);
  const route = useRoute();
  const data = useDashboard();
  const catalogue = useCatalogue();
  const { projects, canControl: canControlProjects } = useProjects();
  const project = projects?.find((p) => p.id === currentProjectId()) ?? null;
  const { pipeline } = usePipeline();
  // The first screen after the intro is Setup whenever no project is configured.
  const [hasProject, setHasProject] = useState<boolean | null>(null);
  useEffect(() => {
    setupApi.project().then((r) => setHasProject(Boolean(r.project))).catch(() => setHasProject(null));
  }, [route.page]);
  useEffect(() => {
    if (!intro && hasProject === false && route.page === 'dashboard') goSetup();
  }, [intro, hasProject, route.page]);
  const pipelineStatus = hasProject ? (pipeline?.status ?? 'idle') : null;
  const modules = catalogue?.modules ?? [];
  const total = modules.reduce((n, m) => n + m.tests.length, 0);

  // A full regression in the browser: one execution per module, in run order (server/runner.mjs).
  const regression = data?.regression ?? null;
  const runningIndex = regression ? Math.min(regression.index, modules.length - 1) : null;
  const regressionBlocked = !data
    ? 'Loading…'
    : data.sample
      ? 'The TestNova server is not running. Start it with npm run dashboard.'
      : !data.canControl
        ? 'A regression can only be started on the PC hosting TestNova'
        : !regression && data.activeModule
          ? 'A module is executing; TestNova runs one execution at a time'
          : null;
  const onRegression = () => {
    setDrawer(false);
    if (regressionBlocked) return;
    setDialog(regression ? 'stop' : 'start');
  };

  const finishIntro = () => {
    sessionStorage.setItem(INTRO_KEY, '1');
    setIntro(false);
  };

  return (
    <MotionConfig reducedMotion="user">
      {/* The dashboard mounts as the warp ends, so its own load sequence continues the motion. */}
      <AnimatePresence>{intro && <Intro stats={{ tests: total, modules: modules.length }} onDone={finishIntro} />}</AnimatePresence>
      {!intro && (
      <div className="min-h-screen bg-page">
        {/* desktop rail */}
        <div className="fixed inset-y-4 left-4 z-30 hidden lg:block">
          <Sidebar modules={modules} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} onRunRegression={onRegression} regressionRunning={Boolean(regression)} route={route} pipelineStatus={pipelineStatus} projects={projects} canControlProjects={canControlProjects} />
        </div>

        {/* mobile drawer */}
        <AnimatePresence>
          {drawer && (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawer(false)}
              />
              <motion.div
                className="fixed inset-y-4 left-4 z-50 lg:hidden"
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              >
                <Sidebar modules={modules} collapsed={false} onToggle={() => setDrawer(false)} onRunRegression={onRegression} regressionRunning={Boolean(regression)} route={route} pipelineStatus={pipelineStatus} projects={projects} canControlProjects={canControlProjects} onNavigate={() => setDrawer(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main
          className={`px-4 pb-10 pt-6 transition-[padding] duration-500 sm:px-6 ${collapsed ? 'lg:pl-[124px]' : 'lg:pl-[304px]'}`}
        >
          <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
            <ErrorBoundary resetKey={route.page === 'module' || route.page === 'regression' ? `${route.page}:${route.id}` : route.page}>
            {route.page === 'setup' ? (
              <SetupPage key={route.fresh ? 'new' : 'edit'} fresh={route.fresh} onMenu={() => setDrawer(true)} />
            ) : route.page === 'pipeline' ? (
              <PipelinePage onMenu={() => setDrawer(true)} />
            ) : route.page === 'report' ? (
              <ReportPage tab={route.tab} params={route.params} onMenu={() => setDrawer(true)} />
            ) : route.page === 'module' ? (
              <ModulePage key={route.id} id={route.id} onMenu={() => setDrawer(true)} />
            ) : route.page === 'regression' ? (
              <RegressionPage
                key={route.id ?? 'latest'}
                id={route.id}
                dashboard={data}
                onMenu={() => setDrawer(true)}
                onRegression={onRegression}
                blocked={regressionBlocked}
              />
            ) : !data ? (
              <p className="py-20 text-center text-[13px] text-ink-3">Loading results…</p>
            ) : (
              <>
                <Topbar
                  project={project?.name ?? null}
                  build={data.build}
                  device={data.device}
                  lastRun={data.run?.endedAt ?? null}
                  sample={data.sample}
                  running={Boolean(regression)}
                  blocked={regressionBlocked}
                  onRun={onRegression}
                  onMenu={() => setDrawer(true)}
                />

                {!data.sample && data.modules.length === 0 && pipeline?.status !== 'completed' && (
                  <Card delay={0.2} glow className="p-6" label="No results yet">
                    <div className="flex flex-wrap items-center gap-5">
                      <span className="grid size-12 shrink-0 place-items-center rounded-full border border-lilac/30 bg-lilac/15 text-lilac"><Workflow size={20} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px] text-ink">{hasProject ? 'The dashboard fills in when the AI Pipeline finishes' : 'Set up a project to begin'}</p>
                        <p className="mt-1 text-[12.5px] text-ink-2">
                          {hasProject
                            ? 'Modules come from the knowledge base, tests from the generated automation, results from real executions. Nothing is shown until it has been measured.'
                            : 'Add the application URL, a test login and your knowledge sources; then the AI Pipeline builds everything this dashboard shows.'}
                        </p>
                      </div>
                      <button onClick={hasProject ? goPipeline : goSetup} className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-[#111]">
                        {hasProject ? 'Open the AI Pipeline' : 'Open Project Setup'}
                      </button>
                    </div>
                  </Card>
                )}

                <KpiRow data={data} />

                <ModuleStrip modules={data.modules} runningId={data.activeModule} />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-12">
                  <div className="h-full lg:col-span-2 2xl:col-span-6">
                    <TrendChart trend={data.trend} delay={0.75} />
                  </div>
                  <div className="h-full 2xl:col-span-3">
                    <Leaderboard modules={data.modules} delay={0.85} />
                  </div>
                  <div className="h-full 2xl:col-span-3">
                    <CauseRose causes={data.causes} delay={0.95} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-12">
                  <div id="regression-flow" className="2xl:col-span-7">
                    <RegressionFlow modules={data.modules} build={data.build} total={total} runningIndex={runningIndex} outcomes={regression?.modules.map((m) => m.status)} delay={1.05} />
                  </div>
                  <div className="2xl:col-span-5">
                    <RunSummary run={data.run} sample={data.sample} delay={1.15} />
                  </div>
                </div>
              </>
            )}
            </ErrorBoundary>

            <p className="pt-2 text-center text-[11px] text-ink-3">TestNova · Redefining Automation Through Intelligent AI</p>
          </div>
        </main>
      </div>
      )}
      <AnimatePresence>
        {dialog && data && (
          <RegressionDialog
            mode={dialog}
            regression={regression}
            modules={modules.length}
            deviceOnline={data.device.online}
            onClose={() => setDialog(null)}
            onStarted={() => goRegression()}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
