import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { api } from '../data/api';
import { withProject } from '../data/projects';

/** Every module's latest real execution in one file. Offered only once there is one to report. */
export function ConsolidatedReport() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api.status().then((s) => setReady(s.hasExecutions)).catch(() => setReady(false));
  }, []);
  return (
    <div className="relative">
      <button
        disabled={!ready}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={ready ? 'Results across all modules, from real executions' : 'No module has been executed yet, or the TestNova server is not running'}
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download size={13} /> Consolidated report
      </button>
      {open && ready && (
        <div className="absolute right-0 z-30 mt-2 w-[220px] rounded-2xl border border-line-2 bg-raised p-1.5 shadow-2xl">
          <a href="#/report" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] text-ink hover:bg-white/[0.07]"><FileText size={14} className="text-ink-2" aria-hidden /> Open the QA report</a>
          <a href={withProject('/api/reports/consolidated?format=pdf')} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] text-ink hover:bg-white/[0.07]"><FileText size={14} className="text-ink-2" aria-hidden /> Download PDF</a>
          <a href={withProject('/api/reports/consolidated?format=xlsx')} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] text-ink hover:bg-white/[0.07]"><FileSpreadsheet size={14} className="text-ink-2" aria-hidden /> Download Excel</a>
          <a href={withProject('/api/reports/defects')} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] text-ink hover:bg-white/[0.07]"><FileSpreadsheet size={14} className="text-ink-2" aria-hidden /> Download Defect Sheet</a>
        </div>
      )}
    </div>
  );
}
