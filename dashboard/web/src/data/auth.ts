import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Sign-in for visitors from another computer (a tunnel link, the LAN). This PC never signs in.
 *
 * The browser signs in to Supabase by email link (PKCE: the link returns to this page with
 * ?code=…, exchanged here for a session), then hands the access token to the TestNova server,
 * which checks it, checks testnova.members, and keeps it in an HttpOnly cookie for every API
 * call. supabase-js refreshes the token before it expires; each refresh is handed over again.
 */
export type Role = 'viewer' | 'operator';
export interface Me { local: boolean; email: string | null; role: Role | null; signedIn: boolean; required: boolean }
interface Config { enabled: boolean; url: string; publishableKey: string; local: boolean }

let client: SupabaseClient | null = null;

export async function authConfig(): Promise<Config> {
  const res = await fetch('/api/auth/config');
  if (!res.ok) throw new Error(`TestNova server answered ${res.status}`);
  return res.json();
}

export function supabase(config: Config): SupabaseClient {
  client ??= createClient(config.url, config.publishableKey, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: 'testnova-auth' },
  });
  return client;
}

export async function me(): Promise<Me> {
  const res = await fetch('/api/auth/me');
  return res.json();
}

/** Give the server the session's token; it answers with the member's role, or why not. */
export async function handOver(session: Session): Promise<{ email: string; role: Role }> {
  const res = await fetch('/api/auth/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken: session.access_token }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Sign-in failed (${res.status})`);
  return body;
}

/** Email a sign-in link. Only invited people have accounts, so this never creates one. */
export async function sendLink(config: Config, email: string): Promise<void> {
  const redirect = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase(config).auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: redirect } });
  if (!error) return;
  if (/signups? not allowed|user not found|not allowed for otp/i.test(error.message)) throw new Error('This email has not been invited to TestNova. Ask the TestNova owner to add you.');
  if (/rate limit|too many/i.test(error.message)) throw new Error('Too many sign-in emails were requested. Wait a few minutes and try again.');
  throw new Error(error.message);
}

export async function signOut(config: Config | null): Promise<void> {
  await fetch('/api/auth/signout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined);
  if (config) await supabase(config).auth.signOut().catch(() => undefined);
}

/** Remove ?code=… (and Supabase's error parameters) from the address bar after the link was used. */
export function cleanUrl(): { error: string | null } {
  const url = new URL(window.location.href);
  const error = url.searchParams.get('error_description');
  let changed = false;
  for (const k of ['code', 'error', 'error_code', 'error_description']) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(null, '', url.toString());
  return { error };
}

/** Any API answer of 401 with signIn (expired or revoked session) sends the page back to sign-in. */
let watching = false;
export function watchSession(onSignedOut: () => void) {
  if (watching) return;
  watching = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if ((res.status === 401 || res.status === 403) && url.includes('/api/') && !url.includes('/api/auth/')) {
      const body = await res.clone().json().catch(() => ({}));
      if (body?.signIn) onSignedOut();
    }
    return res;
  };
}
