#!/usr/bin/env node
/**
 * Build a project's QA report from its stored executions and defect records, without the
 * dashboard running and without any AI model: the same engine the dashboard and stage 8 use.
 *
 *   npm run qa-report -- <project-id> [--out <dir>] [--run <execution id>]
 *
 * Writes <dir>/<project-id>-test-report.pdf, .xlsx and <project-id>-qa-report.json (default dir:
 * the project's qa/06-report), then prints the headline figures and every data validation finding.
 */
import { writeQaReport } from '../server/qa-render.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const pid = args.find((a, i) => !a.startsWith('--') && !['--out', '--run'].includes(args[i - 1]));
if (!pid) {
  console.error('Usage: npm run qa-report -- <project-id> [--out <dir>] [--run <execution id>]');
  process.exit(2);
}

const { report, files } = await writeQaReport(pid, { out: opt('--out'), runId: opt('--run') });
const t = report.totals;
console.log(`${report.meta.reportId}  fingerprint ${report.meta.fingerprint}`);
console.log(`${t.total} test cases: ${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped, ${t.notExecuted} not executed (pass ${t.passPct}%)`);
console.log(`${t.uniqueDefects} unique defects (${t.openDefects} open); ${t.failedLinked} failures linked, ${t.failedUnlinked} not linked`);
console.log(`Recommendation: ${report.recommendation.verdict}`);
for (const v of report.validation) console.log(`  [${v.level}] ${v.check}: ${v.message}`);
for (const f of files) console.log(`wrote ${f}`);
