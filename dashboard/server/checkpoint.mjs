/**
 * Checkpoints: how a stage resumes instead of starting over.
 *
 * Two layers:
 *  - The server owns stage-level state in pipeline.json (status, attempt, the agent's session id,
 *    whether the stage can be resumed, the history of attempts).
 *  - The agent owns task-level progress in qa/checkpoints/stage-<n>.json, which it writes before
 *    it starts and updates after every task (see CHECKPOINT_RULES). Outputs are written to disk as
 *    each task finishes, never held until the end.
 *
 * On a resume the server reads the checkpoint, verifies every "done" task's outputs still exist
 * (a task whose outputs are gone is reset to pending), runs the stage's own validation on what is on
 * disk, and hands all of it to the agent as a brief, together with the last steps of the previous
 * attempt. When the checkpoint says every task is done and the outputs validate, the stage passes
 * without running the agent at all.
 */
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const checkpointRel = (n) => `qa/checkpoints/stage-${n}.json`;

export const CHECKPOINT_RULES = (n) => [
  `Checkpoint (required): keep \`${checkpointRel(n)}\` as your progress record, so an interrupted run can resume instead of starting over.`,
  `- If it already exists, read it first and continue from it (see the RESUME brief, if any). Do not redo a task marked "done" whose outputs exist.`,
  '- Otherwise, before your first output, split the work into tasks of a few minutes each (for example: one per module and kind of output) and write the file with every task "pending".',
  '- Set a task "in-progress" when you start it. Write each output file as soon as it is produced; never hold work until the end. When a task\'s outputs are on disk, set it "done" with their paths in "outputs". A task that cannot be finished is "failed" with the reason in "note".',
  '- Format: {"stage": ' + n + ', "updatedAt": "<ISO time>", "tasks": [{"id": "kebab-id", "title": "…", "status": "pending|in-progress|done|failed", "outputs": ["relative/path"], "note": "…"}], "errors": ["…"]}.',
  '- Update the file right after every task (it is cheap). Paths in "outputs" are relative to the workspace.',
].join('\n');

/** The checkpoint as written, or { error } when unreadable, or null when absent. */
export function readCheckpoint(W, n) {
  const file = join(W, checkpointRel(n));
  if (!existsSync(file)) return null;
  try {
    const cp = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(cp.tasks)) return { error: 'it has no "tasks" array' };
    return cp;
  } catch (e) {
    return { error: `it does not parse (${e.message})` };
  }
}

/**
 * Check a checkpoint against the disk: a "done" task counts only when every output it lists
 * exists and is not empty.
 */
export function assessCheckpoint(W, cp) {
  if (!cp || cp.error) return null;
  const tasks = cp.tasks.map((t) => {
    const outputs = Array.isArray(t.outputs) ? t.outputs.map(String) : [];
    const missing = outputs.filter((p) => {
      try {
        return !statSync(join(W, p)).size;
      } catch {
        return true;
      }
    });
    const status = String(t.status ?? 'pending');
    const verified = status === 'done' && missing.length === 0;
    return { id: String(t.id ?? '?'), title: String(t.title ?? ''), status: status === 'done' && !verified ? 'pending' : status, outputs, missing, reset: status === 'done' && !verified, note: t.note ? String(t.note) : '' };
  });
  const by = (s) => tasks.filter((t) => t.status === s);
  return { tasks, done: by('done'), inProgress: by('in-progress'), pending: by('pending'), failed: by('failed'), allDone: tasks.length > 0 && tasks.every((t) => t.status === 'done') };
}

export function clearCheckpoint(W, n) {
  rmSync(join(W, checkpointRel(n)), { force: true });
}

const fmtTime = (ms) => new Date(ms).toLocaleString('en-GB', { hour12: false });

/** The brief an agent gets when it resumes a stage. */
export function resumeBrief({ n, attempt, budgetMin, prevError, cp, assessed, files, problem, lastSteps, sessionResumed }) {
  const lines = [`RESUME — stage ${n}, attempt ${attempt}. The previous attempt did not finish: ${prevError || 'it stopped before passing'}.`];
  if (budgetMin) lines.push(`This attempt has a fresh time budget of ${budgetMin} minutes. Time spent by the previous attempt does not count against it: do not cut work short or report "ran out of time" — finish the remaining tasks properly.`);
  lines.push(sessionResumed
    ? 'Your earlier conversation is restored above. The facts below are the current state of the disk: trust them over your memory of it.'
    : 'You are a new session: the earlier conversation is not available, but its work on disk is. Do not start over.');

  if (cp?.error) lines.push(`\nThe checkpoint ${checkpointRel(n)} is unreadable: ${cp.error}. Rebuild it from the files on disk before continuing.`);
  else if (!assessed) lines.push(`\nNo checkpoint was written by the previous attempt. Treat the output files listed below as completed work: inspect them (read, don't rewrite), record them as "done" tasks in a new ${checkpointRel(n)}, then continue with what is missing.`);
  else {
    lines.push(`\nCheckpoint ${checkpointRel(n)}: ${assessed.done.length} done (outputs verified on disk), ${assessed.inProgress.length} in progress, ${assessed.pending.length} pending, ${assessed.failed.length} failed.`);
    for (const t of assessed.tasks) {
      const extra = t.reset ? ` — was "done" but outputs are missing: ${t.missing.join(', ')}; redo it` : t.status === 'in-progress' ? ' — interrupted mid-task: inspect its partial outputs and finish only what is missing' : '';
      lines.push(`- [${t.status}] ${t.id}: ${t.title}${t.outputs.length ? ` (${t.outputs.slice(0, 6).join(', ')}${t.outputs.length > 6 ? ', …' : ''})` : ''}${t.note ? ` — note: ${t.note}` : ''}${extra}`);
    }
  }

  if (files.length) {
    lines.push(`\nOutput files on disk now (${files.length}${files.length >= 120 ? '+' : ''}; path · bytes · modified):`);
    for (const f of files.slice(0, 120)) lines.push(`- ${f.path} · ${f.size} · ${fmtTime(f.mtime)}`);
  } else lines.push('\nNo output files are on disk yet.');

  lines.push(`\nValidation of the outputs on disk right now: ${problem ? `fails — ${problem}` : 'passes.'}`);

  if (lastSteps.length) {
    lines.push('\nThe last steps of the previous attempt (oldest first):');
    for (const s of lastSteps) lines.push(`- ${s}`);
  }

  lines.push(
    '\nHow to resume:',
    '1. Do not repeat completed work: no regenerating files that exist and are listed as done, no re-reading every input "to be safe", no re-running analysis or test runs whose result is already recorded for the current code. Read only what you need for the next task.',
    '   A test result is out of date once the script it ran was changed (a fix, a timeout, a new tag): re-run that module — results that predate a fix do not show the fix works, and the stage does not pass on them.',
    '2. Finish the in-progress task first (only its missing part), then the pending ones, in order. Update the checkpoint after each.',
    '3. If the previous attempt was stopped by a long command (a test run, a sleep), do not run it the same way again: bound it (--global-timeout, --max-failures, --retries=0, fewer tests).',
    '4. When everything is done and validates, finish with your normal summary. Never mark a task done while its last result is out of date.',
  );
  return lines.join('\n');
}

/** "HH:MM:SS tool: …" lines from the end of a stage log, for the brief. */
export function lastStepsFrom(logPath, max = 20) {
  if (!logPath || !existsSync(logPath)) return [];
  const out = [];
  for (const line of readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean)) {
    try {
      const e = JSON.parse(line);
      if (!['tool', 'text', 'tool-error', 'error'].includes(e.kind)) continue;
      const t = new Date(e.at).toLocaleTimeString('en-GB', { hour12: false });
      out.push(`${t} ${e.kind === 'tool' ? e.tool : e.kind}: ${String(e.text ?? '').replace(/\s+/g, ' ').slice(0, 220)}`);
    } catch {
      // partial line
    }
  }
  return out.slice(-max);
}
