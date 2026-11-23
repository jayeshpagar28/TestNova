/**
 * Who is asking: this PC, or a signed-in member of the team.
 *
 * This PC (see isLocal in index.mjs) needs no sign-in and controls everything. Anyone else (a
 * tunnel link, the LAN) must sign in with Supabase (email link) and be on testnova.members:
 *   viewer    reads everything
 *   operator  reads, and starts/stops runs, regressions and the pipeline, and sets defect status
 * Setup (projects, test logins, knowledge files, deleting a project) stays with this PC only,
 * because it handles credentials.
 *
 * The browser signs in with the publishable key and hands its access token to POST
 * /api/auth/session, which checks it with Supabase and keeps it in an HttpOnly cookie, so plain
 * requests (images, downloads, the event stream) carry it too. Each token is re-checked with
 * Supabase at most every 5 minutes, and membership every minute: removing someone from
 * testnova.members locks them out within a minute.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from './workspace.mjs';

const require = createRequire(import.meta.url);
export const COOKIE = 'tn_session';
const TOKEN_TTL = 5 * 60_000;
const MEMBER_TTL = 60_000;

function env() {
  const file = join(ROOT, '.env');
  const out = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').trim();
    }
  }
  return { url: process.env.SUPABASE_URL ?? out.SUPABASE_URL ?? '', publishable: process.env.SUPABASE_PUBLISHABLE_KEY ?? out.SUPABASE_PUBLISHABLE_KEY ?? '', secret: process.env.SUPABASE_SECRET_KEY ?? out.SUPABASE_SECRET_KEY ?? '' };
}

let admin = null;
const client = () => {
  if (!admin) {
    const c = env();
    const { createClient } = require('@supabase/supabase-js');
    admin = createClient(c.url, c.secret, { db: { schema: 'testnova' }, auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
};

/** What the sign-in page needs. The publishable key is public by design (RLS guards the data). */
export function authConfig() {
  const c = env();
  return { enabled: Boolean(c.url && c.publishable && c.secret), url: c.url, publishableKey: c.publishable };
}

// ── token and membership checks, cached ──────────────────────────────────────
const tokens = new Map(); // token → { email, until }
const members = { at: 0, map: new Map() };

async function memberRole(email) {
  if (Date.now() - members.at > MEMBER_TTL) {
    const { data, error } = await client().from('members').select('email, role');
    if (error) throw new Error(`members: ${error.message}`);
    members.map = new Map(data.map((m) => [m.email.toLowerCase(), m.role]));
    members.at = Date.now();
  }
  return members.map.get(String(email).toLowerCase()) ?? null;
}

/** { email } for a valid Supabase access token, else null. */
async function verify(token) {
  if (!token || token.length > 4096) return null;
  const hit = tokens.get(token);
  if (hit && hit.until > Date.now()) return hit;
  const { data, error } = await client().auth.getUser(token);
  if (error || !data?.user?.email) {
    tokens.delete(token);
    return null;
  }
  // never trust a token past its own expiry, even inside the cache window
  let exp = Date.now() + TOKEN_TTL;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (payload.exp) exp = Math.min(exp, payload.exp * 1000);
  } catch {}
  const entry = { email: data.user.email.toLowerCase(), until: exp };
  tokens.set(token, entry);
  if (tokens.size > 500) for (const [k, v] of tokens) if (v.until < Date.now()) tokens.delete(k);
  return entry;
}

const cookieOf = (req) => {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
};
const bearer = (req) => String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

/**
 * The caller: { local: true, role: 'operator' } for this PC; { email, role } for a signed-in
 * member; { email, role: null } for someone signed in but not a member; { role: null } otherwise.
 */
export async function identify(req, local) {
  if (local) return { local: true, email: null, role: 'operator' };
  if (!authConfig().enabled) return { local: false, email: null, role: null };
  const who = await verify(bearer(req) ?? cookieOf(req));
  if (!who) return { local: false, email: null, role: null };
  return { local: false, email: who.email, role: await memberRole(who.email) };
}

/** Check a token the browser just obtained; the caller sets the cookie when it is a member's. */
export async function startSession(token) {
  const who = await verify(token);
  if (!who) return { ok: false, status: 401, error: 'The sign-in link has expired or is invalid. Request a new one.' };
  const role = await memberRole(who.email);
  if (!role) return { ok: false, status: 403, error: `${who.email} is not on the TestNova team. Ask the TestNova owner to add you.` };
  return { ok: true, email: who.email, role };
}

/** Set-Cookie for the session: HttpOnly (no script reads it), Lax, Secure when the visitor is on https. */
export function sessionCookie(req, token) {
  const https = /https/i.test(String(req.headers['x-forwarded-proto'] ?? '')) || /https/i.test(String(req.headers['cf-visitor'] ?? ''));
  const value = token ? encodeURIComponent(token) : '';
  return `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Lax${https ? '; Secure' : ''}; Max-Age=${token ? 7 * 86400 : 0}`;
}

/** Routes a signed-in operator may change from another machine. Everything else is this PC only. */
export const OPERATOR_ROUTES = new Set(['runs', 'regressions', 'pipeline', 'defects', 'links']);
