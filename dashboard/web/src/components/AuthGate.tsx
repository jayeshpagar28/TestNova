import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Loader2, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { authConfig, cleanUrl, handOver, sendLink, signOut, supabase, watchSession, type Role } from '../data/auth';
import { EASE_OUT } from '../theme';

type Config = Awaited<ReturnType<typeof authConfig>>;
type State =
  | { kind: 'loading' }
  | { kind: 'local' }
  | { kind: 'member'; email: string; role: Role }
  | { kind: 'signin'; error?: string }
  | { kind: 'disabled' }
  | { kind: 'offline'; error: string };

/**
 * The page for one person. On the PC hosting TestNova it is the app itself. From anywhere else
 * (a shared link, the LAN) the visitor signs in by email link first, and must be on the team:
 * viewers see everything, operators can also run tests and drive the pipeline.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const config = useRef<Config | null>(null);

  useEffect(() => {
    let alive = true;
    const set = (s: State) => alive && setState(s);
    (async () => {
      let c: Config;
      try {
        c = await authConfig();
      } catch (e) {
        return set({ kind: 'offline', error: (e as Error).message });
      }
      config.current = c;
      if (c.local) return set({ kind: 'local' });
      if (!c.enabled) return set({ kind: 'disabled' });
      watchSession(() => set({ kind: 'signin', error: 'Your session ended. Sign in again.' }));
      const sb = supabase(c);
      const linkError = cleanUrl().error;
      // getSession also completes a returning sign-in link (?code=…)
      const { data } = await sb.auth.getSession();
      cleanUrl();
      if (!data.session) return set({ kind: 'signin', error: linkError ?? undefined });
      try {
        const m = await handOver(data.session);
        set({ kind: 'member', email: m.email, role: m.role });
      } catch (e) {
        await sb.auth.signOut().catch(() => undefined);
        set({ kind: 'signin', error: (e as Error).message });
      }
      // refreshed tokens go to the server too, so the session outlives the 1-hour token
      sb.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED' && session) handOver(session).catch(() => set({ kind: 'signin', error: 'Your session ended. Sign in again.' }));
        if (event === 'SIGNED_OUT') set({ kind: 'signin' });
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === 'loading') return null;
  if (state.kind === 'local') return <>{children}</>;
  if (state.kind === 'member') {
    return (
      <>
        {children}
        <Account email={state.email} role={state.role} onSignOut={async () => {
          await signOut(config.current);
          setState({ kind: 'signin' });
        }} />
      </>
    );
  }
  return <SignIn state={state} config={config.current} />;
}

function Account({ email, role, onSignOut }: { email: string; role: Role; onSignOut: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-line bg-card/90 py-1.5 pl-3 pr-1.5 text-[12px] text-ink-2 shadow-lg backdrop-blur">
      <ShieldCheck size={13} className={role === 'operator' ? 'text-electric' : 'text-ink-3'} />
      <span className="max-w-[220px] truncate">{email}</span>
      <span className="rounded-full border border-line px-1.5 text-[10.5px] text-ink-3" title={role === 'operator' ? 'Can view, run tests and drive the pipeline' : 'Can view everything; cannot start or change anything'}>{role}</span>
      <button onClick={onSignOut} aria-label="Sign out" title="Sign out" className="grid size-6 place-items-center rounded-full text-ink-3 hover:bg-white/10 hover:text-ink">
        <LogOut size={12} />
      </button>
    </div>
  );
}

function SignIn({ state, config }: { state: State; config: Config | null }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState(state.kind === 'signin' ? state.error ?? '' : '');

  const message =
    state.kind === 'disabled' ? 'Remote access is not set up on the PC hosting TestNova (Supabase keys are missing).'
    : state.kind === 'offline' ? `The TestNova server cannot be reached: ${state.error}`
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter the email address you were invited with.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await sendLink(config, email);
      setSent(email.trim().toLowerCase());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <motion.section
        initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
        aria-labelledby="signin-title"
        className="w-full max-w-[400px] rounded-[22px] border border-line bg-card p-7"
      >
        <h1 id="signin-title" className="text-[22px] font-medium text-ink">TestNova</h1>
        <p className="mt-1 text-[13px] text-ink-3">Sign in to see the test results{message ? '' : ' shared with you'}.</p>

        {message ? (
          <p role="alert" className="mt-6 text-[13px] text-warn">{message}</p>
        ) : sent ? (
          <div className="mt-6 space-y-2 text-[13px] text-ink-2" role="status">
            <p className="flex items-center gap-2 text-ink"><Mail size={15} className="text-lilac" /> Check your email</p>
            <p>We sent a sign-in link to <span className="text-ink">{sent}</span>. Open it in this browser; it works once and expires in an hour.</p>
            <button onClick={() => setSent('')} className="text-[12.5px] text-lilac hover:underline">Use another email</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3" noValidate>
            <label htmlFor="signin-email" className="block text-[12.5px] text-ink-2">Work email</label>
            <input
              id="signin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)} aria-describedby={error ? 'signin-error' : undefined}
              className="w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-lilac/60"
              placeholder="name@company.com"
            />
            {error && <p id="signin-error" role="alert" className="text-[12.5px] text-bad">{error}</p>}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-lilac/40 bg-lilac/15 px-3 py-2.5 text-[13.5px] text-ink hover:bg-lilac/25 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Email me a sign-in link
            </button>
            <p className="text-[11.5px] text-ink-3">Only people invited to this TestNova can sign in.</p>
          </form>
        )}
      </motion.section>
    </main>
  );
}
