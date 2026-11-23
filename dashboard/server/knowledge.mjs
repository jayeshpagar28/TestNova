/**
 * Projects and their knowledge sources (the Setup screen).
 *
 *   projects/<id>/project.json            name, URL, environment, browsers, roles (names only)
 *   projects/<id>/knowledge/sources.json  every source: file, link or note, with its parse status
 *   projects/<id>/knowledge/files/        uploads, as received
 *   projects/<id>/knowledge/extracted/    plain text pulled out of each upload (what agents read)
 *   projects/<id>/knowledge/links/        fetched copy of each readable link, as text
 *   projects/<id>/knowledge/links.json    the links and their status, for the agents
 *   projects/<id>/knowledge/notes.md      every note, for the agents
 *   projects/<id>/.env                    that project's test logins
 *   projects/active.json                  the project shown by default
 *
 * Each project is independent (see workspace.mjs): saving one never touches another's files.
 * Test-login credentials go to the project's own .env on this PC and nowhere else: never into
 * project.json, the sources, a log, an API answer or Supabase. The API only says whether they are set.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, extname, join } from 'node:path';
import { PROJECTS, ROOT, activeProjectId as defaultProjectId, ensureWorkspace, isProjectId, projectIds, setActiveProject } from './workspace.mjs';
import { parseTestingType } from './testing-types.mjs';

const require = createRequire(import.meta.url);
const ROOT_ENV = join(ROOT, '.env');
const BROWSERS = ['chromium', 'firefox', 'webkit'];
export const MAX_UPLOAD = 25 * 1024 * 1024;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const readJson = (path, fallback) => {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
const dir = (id, ...p) => join(PROJECTS, id, ...p);
const validId = isProjectId;

// ── .env (credentials), one file per project ───────────────────────────────
const envFileOf = (id) => dir(id, '.env');
function readEnvFile(id) {
  const file = envFileOf(id);
  return existsSync(file) ? readFileSync(file, 'utf8') : '# Test logins for this project only. Written by the Setup screen. Never commit.\n';
}
function envGet(id, key) {
  return readEnvFile(id).match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '';
}
/** Set or remove (value null) keys in the project's .env, keeping every other line as it is. */
function envSet(id, pairs) {
  let text = readEnvFile(id);
  for (const [key, value] of Object.entries(pairs)) {
    const re = new RegExp(`^${key}=.*\\r?\\n?`, 'm');
    if (value === null) text = text.replace(re, '');
    else if (re.test(text)) text = text.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${value}`);
    else text = `${text.replace(/\n?$/, '\n')}${key}=${value}\n`;
  }
  writeFileSync(envFileOf(id), text);
}
export const envPrefix = (key) => {
  const k = String(key ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return k ? `TEST_${k}_` : 'TEST_';
};
/** A value a .env line can hold: no newlines; quoted when it has spaces, '#' or quotes. */
const envValue = (v) => {
  const s = String(v).replace(/[\r\n]/g, '');
  return /[\s#'"`]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
};
/** Masked view: whether each credential is set, and the username's first two characters. */
function credentialState(id, key) {
  const p = envPrefix(key);
  const user = envGet(id, `${p}USERNAME`).replace(/^"|"$/g, '');
  return { username: Boolean(user), password: Boolean(envGet(id, `${p}PASSWORD`)), hint: user ? `${user.slice(0, 2)}${'•'.repeat(6)}` : null };
}

// ── projects ────────────────────────────────────────────────────────────────
export const activeProjectId = defaultProjectId;
export { projectIds, setActiveProject };

export function projectView(id = activeProjectId()) {
  if (!id || !validId(id)) return null;
  const project = readJson(dir(id, 'project.json'), null);
  return {
    ...project,
    roles: (project.roles ?? []).map((r) => ({ ...r, credentials: credentialState(id, r.key) })),
    sources: readJson(dir(id, 'knowledge', 'sources.json'), []),
  };
}

export function validateUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw fail('Enter a full URL, starting with https:// or http://');
  }
  if (!/^https?:$/.test(url.protocol)) throw fail('The application URL must start with https:// or http://');
  if (url.username || url.password) throw fail('Do not put credentials in the URL; use the Test login fields.');
  return url.toString();
}

/** Is the application up? Any HTTP answer below 500 counts: a login wall (401/403) is normal. */
export async function checkUrl(raw) {
  const url = validateUrl(raw);
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'TestNova/1.0 (+setup reachability check)' } });
    return { url, reachable: res.status < 500, status: res.status, finalUrl: res.url, ms: Date.now() - started };
  } catch (e) {
    return { url, reachable: false, status: null, error: e.cause?.code ?? e.name ?? e.message, ms: Date.now() - started };
  }
}

/**
 * Create (no `id`) or update a project. A new project gets its own id and workspace; nothing of any
 * other project is read or changed. `roles` arrive as [{ name, username?, password? }]; the first role
 * is the default (TEST_USERNAME); others become TEST_<ROLE>_*. An empty password leaves the stored
 * one unchanged, so the masked form can be saved without retyping it.
 */
export async function saveProject(body) {
  const name = String(body.name ?? '').trim();
  if (!name) throw fail('Project name is required.');
  const url = validateUrl(body.url);
  const probe = await checkUrl(url);
  if (!probe.reachable) throw fail(`${url} is not reachable from this PC (${probe.status ? `HTTP ${probe.status}` : probe.error}). Check the URL, VPN or that the environment is up.`, 422);
  const browsers = (Array.isArray(body.browsers) ? body.browsers : []).filter((b) => BROWSERS.includes(b));
  if (!browsers.length) throw fail('Choose at least one browser.');
  const environment = String(body.environment ?? '').trim() || 'QA';

  if (body.id && !validId(body.id)) throw fail('Unknown project', 404);
  const creating = !body.id;
  if (creating && projectIds().some((pid) => readJson(dir(pid, 'project.json'), {})?.name?.trim().toLowerCase() === name.toLowerCase())) {
    throw fail(`A project named "${name}" already exists. Pick it from the project list, or use another name.`, 409);
  }
  let id = body.id;
  while (!id || (creating && existsSync(dir(id)))) id = `${slug(name)}-${randomBytes(2).toString('hex')}`;
  const previous = readJson(dir(id, 'project.json'), null);
  // The testing type is chosen when a project is created, and can be changed later (the next pipeline
  // start then switches the run: stages 3–8 again for the new type). A form that does not send the
  // field keeps the saved type. Projects created before testing types existed have none, i.e. Full
  // Coverage. null is Full Coverage.
  const testingType = 'testingType' in body ? parseTestingType(body.testingType) : (previous?.testingType ?? null);
  const roles = [];
  const env = {};
  const input = Array.isArray(body.roles) && body.roles.length ? body.roles : [{ name: 'Default' }];
  input.forEach((r, i) => {
    const roleName = String(r.name ?? '').trim() || (i === 0 ? 'Default' : `Role ${i + 1}`);
    const key = i === 0 ? '' : slug(roleName).replace(/-/g, '_');
    if (roles.some((x) => x.key === key)) throw fail(`Two roles have the same name: ${roleName}`);
    roles.push({ name: roleName, key });
    const p = envPrefix(key);
    if (typeof r.username === 'string' && r.username.trim()) env[`${p}USERNAME`] = envValue(r.username.trim());
    if (typeof r.password === 'string' && r.password) env[`${p}PASSWORD`] = envValue(r.password);
  });
  // roles removed since the last save lose their stored credentials
  for (const old of previous?.roles ?? []) {
    if (!roles.some((r) => r.key === old.key)) Object.assign(env, { [`${envPrefix(old.key)}USERNAME`]: null, [`${envPrefix(old.key)}PASSWORD`]: null });
  }
  mkdirSync(dir(id, 'knowledge', 'files'), { recursive: true });
  // its own framework copy and .env before any credential is written
  ensureWorkspace(id);
  if (Object.keys(env).length) envSet(id, env);

  const project = {
    id, name, url, environment, browsers, roles,
    // written only when a type is chosen: a Full Coverage project.json stays exactly as before
    ...(testingType ? { testingType } : {}),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeJson(dir(id, 'project.json'), project);
  setActiveProject(id);
  if (!existsSync(dir(id, 'knowledge', 'sources.json'))) writeJson(dir(id, 'knowledge', 'sources.json'), []);
  writeAgentIndexes(id);
  return projectView(id);
}

// ── sources ─────────────────────────────────────────────────────────────────
const sourcesOf = (id) => readJson(dir(id, 'knowledge', 'sources.json'), []);
function saveSources(id, sources) {
  writeJson(dir(id, 'knowledge', 'sources.json'), sources);
  writeAgentIndexes(id);
}
const newSourceId = () => `src-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;

/** links.json and notes.md: the shapes the stage 1 agent is told to read. */
function writeAgentIndexes(id) {
  const sources = sourcesOf(id);
  writeJson(dir(id, 'knowledge', 'links.json'), sources.filter((s) => s.kind === 'link').map(({ url, status, detail, file, title }) => ({ url, status, detail, title: title ?? null, file: file ?? null })));
  const notes = sources.filter((s) => s.kind === 'note');
  writeFileSync(dir(id, 'knowledge', 'notes.md'), `# Notes from the project owner\n\n${notes.length ? notes.map((n) => `- ${n.text.replace(/\n+/g, ' ')}`).join('\n') : '_No notes._'}\n`);
}

const TYPES = {
  '.pdf': 'pdf', '.docx': 'docx', '.xlsx': 'xlsx', '.csv': 'csv', '.md': 'md', '.txt': 'txt',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image',
};

async function extractText(type, buffer) {
  if (type === 'md' || type === 'txt' || type === 'csv') return buffer.toString('utf8');
  if (type === 'pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await pdfText(pdf, { mergePages: false });
    return text.map((t, i) => `--- page ${i + 1} of ${totalPages} ---\n${t}`).join('\n\n');
  }
  if (type === 'docx') {
    const mammoth = require('mammoth');
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (type === 'xlsx') {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    // ExcelJS cell values: primitives, Date, { richText }, { text, hyperlink }, { formula, result },
    // { sharedFormula, result }, { error }. `text`/`result` may themselves be non-strings, so recurse
    // and always return a string.
    const cell = (v) => {
      if (v == null) return '';
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
      if (typeof v !== 'object') return String(v);
      if (Array.isArray(v.richText)) return v.richText.map((r) => cell(r?.text)).join('');
      if ('text' in v) return cell(v.text);
      if ('result' in v) return cell(v.result);
      if ('error' in v) return String(v.error);
      if ('formula' in v || 'sharedFormula' in v) return '';
      return '';
    };
    const out = [];
    wb.eachSheet((sheet) => {
      out.push(`--- sheet: ${sheet.name} ---`);
      sheet.eachRow((row) => {
        const vals = [];
        // Merged ranges report the master's value in every cell; keep it once (blank the rest).
        row.eachCell({ includeEmpty: true }, (c) => vals.push(c.isMerged && c.master !== c ? '' : cell(c.value).replace(/\t|\r?\n/g, ' ')));
        out.push(vals.join('\t').replace(/\t+$/, ''));
      });
    });
    return out.join('\n');
  }
  return null; // images: the agent reads them directly
}

export async function addFile(id, { name, data }) {
  if (!validId(id)) throw fail('Unknown project', 404);
  const fileName = basename(String(name ?? '')).replace(/[^\w.\- ()]+/g, '_');
  const type = TYPES[extname(fileName).toLowerCase()];
  if (!type) throw fail(`${fileName}: unsupported type. Use .pdf .docx .xlsx .csv .md .txt or an image.`);
  const buffer = Buffer.from(String(data ?? ''), 'base64');
  if (!buffer.length) throw fail(`${fileName} is empty.`);
  if (buffer.length > MAX_UPLOAD) throw fail(`${fileName} is larger than 25 MB.`);

  const sid = newSourceId();
  const stored = `${sid}-${fileName}`;
  writeFileSync(dir(id, 'knowledge', 'files', stored), buffer);
  const source = { id: sid, kind: 'file', type, name: fileName, size: buffer.length, file: `knowledge/files/${stored}`, status: 'parsing', detail: null, addedAt: new Date().toISOString() };
  try {
    const text = await extractText(type, buffer);
    if (text === null) {
      Object.assign(source, { status: 'parsed', detail: 'Image: the agents read it directly' });
    } else if (!text.trim()) {
      Object.assign(source, { status: 'failed', detail: type === 'pdf' ? 'No text layer (a scanned PDF?); upload the images or a text version' : 'No text found' });
    } else {
      mkdirSync(dir(id, 'knowledge', 'extracted'), { recursive: true });
      writeFileSync(dir(id, 'knowledge', 'extracted', `${stored}.txt`), text);
      Object.assign(source, { status: 'parsed', extracted: `knowledge/extracted/${stored}.txt`, detail: `${text.length.toLocaleString('en')} characters extracted` });
    }
  } catch (e) {
    Object.assign(source, { status: 'failed', detail: `Could not read: ${e.message}`.slice(0, 200) });
  }
  saveSources(id, [...sourcesOf(id), source]);
  return source;
}

/** HTML to readable text: drop scripts, styles and tags, keep line structure. */
function htmlText(html) {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();
}

/**
 * Fetch a public link. Anything that answers with a login wall is "not readable": the agents treat
 * it as a gap, never as a source. Figma and similar app pages render client-side, so a page with
 * almost no text is also marked not readable rather than saved as an empty "source".
 */
export async function addLink(id, { url: raw }) {
  if (!validId(id)) throw fail('Unknown project', 404);
  const url = validateUrl(raw);
  const source = { id: newSourceId(), kind: 'link', type: 'link', name: url, url, size: null, status: 'fetching', detail: null, addedAt: new Date().toISOString() };
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'Mozilla/5.0 TestNova/1.0 (knowledge source fetch)', accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' } });
    const finalUrl = res.url;
    const type = res.headers.get('content-type') ?? '';
    const body = type.includes('text') || type.includes('json') || type.includes('xml') ? await res.text() : '';
    const loginWall = res.status === 401 || res.status === 403
      || /\/(login|signin|sign-in|auth|sso|oauth|saml)(\/|\?|$)/i.test(new URL(finalUrl).pathname)
      || /<input[^>]+type=["']?password/i.test(body);
    const text = type.includes('html') ? htmlText(body) : body.trim();
    source.title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
    if (loginWall) {
      Object.assign(source, { status: 'not-readable', detail: `Needs a login (HTTP ${res.status}${finalUrl !== url ? `, redirected to ${new URL(finalUrl).host}${new URL(finalUrl).pathname}` : ''})` });
    } else if (!res.ok) {
      Object.assign(source, { status: 'not-readable', detail: `HTTP ${res.status}` });
    } else if (text.length < 200) {
      Object.assign(source, { status: 'not-readable', detail: 'Almost no readable text (the page renders in the browser, or needs a login)' });
    } else {
      mkdirSync(dir(id, 'knowledge', 'links'), { recursive: true });
      const file = `knowledge/links/${source.id}.txt`;
      writeFileSync(dir(id, file), `Source: ${url}\nFetched: ${new Date().toISOString()}\nTitle: ${source.title ?? ''}\n\n${text}`);
      Object.assign(source, { status: 'fetched', file, size: Buffer.byteLength(text), detail: `${text.length.toLocaleString('en')} characters` });
    }
  } catch (e) {
    Object.assign(source, { status: 'not-readable', detail: `Could not fetch (${e.cause?.code ?? e.name})` });
  }
  saveSources(id, [...sourcesOf(id), source]);
  return source;
}

export function addNote(id, { text }) {
  if (!validId(id)) throw fail('Unknown project', 404);
  const t = String(text ?? '').trim();
  if (!t) throw fail('A note cannot be empty.');
  if (t.length > 4000) throw fail('Keep a note under 4000 characters.');
  const source = { id: newSourceId(), kind: 'note', type: 'note', name: t.length > 60 ? `${t.slice(0, 57)}…` : t, text: t, size: Buffer.byteLength(t), status: 'saved', detail: null, addedAt: new Date().toISOString() };
  saveSources(id, [...sourcesOf(id), source]);
  return source;
}

export function removeSource(id, sourceId) {
  if (!validId(id)) throw fail('Unknown project', 404);
  const sources = sourcesOf(id);
  const source = sources.find((s) => s.id === sourceId);
  if (!source) throw fail('Unknown source', 404);
  for (const f of [source.file, source.extracted]) {
    if (f && f.startsWith('knowledge/')) rmSync(dir(id, f), { force: true });
  }
  saveSources(id, sources.filter((s) => s.id !== sourceId));
}

/** Values that must never appear in a log or an API answer: every credential and secret, in the
 * root .env and every project's .env (a log of one project must not show another's either). */
export function secretValues() {
  const out = [];
  const files = [ROOT_ENV, ...projectIds().map(envFileOf)].filter((f) => existsSync(f));
  for (const line of files.flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/))) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || !/(PASSWORD|SECRET|TOKEN|USERNAME|_KEY)$/.test(m[1])) continue;
    const v = m[2].replace(/^"(.*)"$/, '$1');
    if (v.length >= 3) out.push(v);
  }
  return out.sort((a, b) => b.length - a.length);
}

export const projectDir = (id) => dir(id);
export const fileSize = (path) => (existsSync(path) ? statSync(path).size : null);
