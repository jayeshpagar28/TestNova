import { useState } from 'react';
import { motion } from 'motion/react';
import { api, type Regression } from '../data/api';

/** What a full regression does along the way, in the browser. */
const DEVICE_STEPS = [
  'runs each module on every browser configured for the project',
  'keeps a screenshot, trace and video for every failed test',
  'records console errors and failed network calls for defect analysis',
];

/**
 * Starting a full regression drives the application under test for a long time; stopping one throws away the
 * modules still to come. Both are confirmed here.
 */
export function RegressionDialog({
  mode, regression, modules, deviceOnline, onClose, onStarted,
}: {
  mode: 'start' | 'stop';
  regression: Regression | null;
  modules: number;
  deviceOnline: boolean;
  onClose: () => void;
  onStarted: (r: Regression) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = () => {
    setBusy(true);
    setError('');
    const call = mode === 'start' ? api.startRegression().then(onStarted) : api.stopRegression(regression!.id);
    call.then(onClose).catch((e: Error) => {
      setError(e.message);
      setBusy(false);
    });
  };

  const current = regression && regression.modules[Math.min(regression.index, regression.modules.length - 1)];
  const left = regression ? regression.modules.length - regression.index - 1 : 0;

  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={busy ? undefined : onClose} />
      <motion.div
        role="alertdialog"
        aria-label={mode === 'start' ? 'Confirm full regression' : 'Confirm stopping the regression'}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        className="fixed left-1/2 top-[18%] z-50 w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 rounded-[22px] border border-line-2 bg-panel p-6"
      >
        {mode === 'start' ? (
          <>
            <h2 className="text-[16px] text-ink">Run the full regression?</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              All {modules} modules run in the browser, one after another, in the knowledge base's run order. A failing
              module does not stop the rest.
            </p>
            <p className="mt-3 text-[13px] text-ink">On the way, TestNova:</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-ink-2">
              {DEVICE_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-ink-3">Single-use tests (tagged @live) skip, as in any module run.</p>
            {!deviceOnline && <p className="mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-[12.5px] text-ink">The application is not reachable from this PC.</p>}
          </>
        ) : (
          <>
            <h2 className="text-[16px] text-ink">Stop the regression?</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              {current?.name} stops now, and its unfinished tests are left without a result.
              {left > 0 && ` The ${left} module${left === 1 ? '' : 's'} after it will not run.`} Results already recorded are kept.
            </p>
          </>
        )}
        {error && <p className="mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-[12.5px] text-ink">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button disabled={busy} onClick={onClose} className="rounded-full border border-line-2 px-4 py-1.5 text-[13px] text-ink disabled:opacity-50">
            Cancel
          </button>
          <button
            disabled={busy || (mode === 'start' && !deviceOnline)}
            onClick={confirm}
            className="rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-[#111] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === 'start' ? (busy ? 'Starting…' : 'Start regression') : busy ? 'Stopping…' : 'Stop regression'}
          </button>
        </div>
      </motion.div>
    </>
  );
}
