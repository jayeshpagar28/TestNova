/**
 * Passed to Playwright Test as a custom reporter for every TestNova run. It appends one JSON line per
 * event to $TESTNOVA_EVENTS, which server/runner.mjs tails, and copies each test's attachments
 * (failure screenshot, trace.zip, video, error context, web signals, a11y scans) into
 * $TESTNOVA_EVIDENCE, because test-results/
 * is overwritten by the next run while an execution's evidence has to stay with that execution.
 */
import { appendFileSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ANSI = /\u001b\[[0-9;]*m/g;
const plain = (s) => (s ?? '').replace(ANSI, '');
const EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'application/zip': 'zip',
  'text/markdown': 'md', 'text/plain': 'txt', 'application/json': 'json', 'text/xml': 'xml', 'application/xml': 'xml',
};
/** The browser project a test ran in (chromium / firefox / webkit). */
const projectOf = (test) => test.parent?.project()?.name ?? null;

/** Assertion text carries "Expected: x / Received: y"; a locator timeout carries neither. */
function comparison(message) {
  const expected = message.match(/^\s*Expected(?:\s[\w ]+)?:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const actual = message.match(/^\s*(?:Received|Actual)(?:\s[\w ]+)?:\s*(.+)$/im)?.[1]?.trim() ?? null;
  return { expected, actual };
}

function status(test, result) {
  if (result.status === 'interrupted') return 'notrun';
  const outcome = test.outcome();
  if (outcome === 'skipped') return 'skipped';
  return outcome === 'unexpected' ? 'failed' : 'passed';
}

export default class TestNovaReporter {
  constructor() {
    this.out = process.env.TESTNOVA_EVENTS;
    this.evidence = process.env.TESTNOVA_EVIDENCE;
    // Browser lanes run in parallel into one evidence folder: each lane prefixes its files.
    this.prefix = (process.env.TESTNOVA_EVIDENCE_PREFIX ?? '').replace(/[^\w-]+/g, '_');
    this.index = 0;
    this.steps = new Map();
    mkdirSync(this.evidence, { recursive: true });
  }

  printsToStdio() {
    return false;
  }

  emit(event) {
    appendFileSync(this.out, `${JSON.stringify({ ...event, at: Date.now() })}\n`);
  }

  onBegin(_config, suite) {
    this.emit({ type: 'begin', total: suite.allTests().length });
  }

  onTestBegin(test, result) {
    this.steps.set(result, []);
    this.emit({ type: 'testBegin', title: test.title, project: projectOf(test), retry: result.retry });
  }

  onStepEnd(_test, result, step) {
    if (step.category !== 'test.step' && step.category !== 'expect') return;
    this.steps.get(result)?.push({ title: step.title, durationMs: step.duration, error: plain(step.error?.message).split('\n')[0] || null });
  }

  saveAttachments(result) {
    this.index += 1;
    const saved = [];
    for (const [i, a] of result.attachments.entries()) {
      if (!a.path && !a.body) continue;
      const name = a.name.replace(/[^\w-]+/g, '_');
      const file = `${this.prefix}${this.index}-${result.retry}-${i}-${name}.${EXT[a.contentType] ?? 'bin'}`;
      try {
        if (a.path) copyFileSync(a.path, join(this.evidence, file));
        else writeFileSync(join(this.evidence, file), a.body);
        saved.push({ name: a.name, file, contentType: a.contentType });
      } catch {
        // an unreadable attachment must not cost the run its result
      }
    }
    return saved;
  }

  onTestEnd(test, result) {
    const errors = result.errors.map((e) => ({ message: plain(e.message ?? e.value ?? ''), stack: plain(e.stack) }));
    const message = errors[0]?.message ?? '';
    const skip = [...test.annotations, ...result.annotations].find((a) => a.type === 'skip' || a.type === 'fixme');
    this.emit({
      type: 'testEnd',
      title: test.title,
      project: projectOf(test),
      retry: result.retry,
      status: status(test, result),
      durationMs: result.duration,
      skipReason: skip?.description ?? null,
      failure: errors.length ? { reason: message.split('\n')[0], message, stack: errors[0].stack, ...comparison(message) } : null,
      evidence: this.saveAttachments(result),
      steps: this.steps.get(result) ?? [],
    });
    this.steps.delete(result);
  }

  onError(error) {
    this.emit({ type: 'error', message: plain(error.message ?? error.value ?? '') });
  }

  onEnd(result) {
    this.emit({ type: 'end', status: result.status });
  }
}
