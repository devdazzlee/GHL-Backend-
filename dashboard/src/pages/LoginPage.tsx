import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/** Only same-dashboard paths are allowed as the page to return to after signing in. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login') ? value : '/';
}

export function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'signedIn') return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 15% 20%, rgb(20 184 166 / 0.18), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 80%, rgb(45 212 191 / 0.08), transparent 50%), linear-gradient(160deg, #09090b 0%, #111113 45%, #0a1412 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.85%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")',
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
        <aside className="flex flex-1 flex-col justify-between px-8 pb-6 pt-10 sm:px-12 lg:px-16 lg:py-16">
          <div className="mt-4 max-w-xl lg:mt-0 lg:flex-1 lg:flex lg:flex-col lg:justify-center">
            <img
              src="/logo.png?v=7"
              alt="Peakwa"
              className="logo-on-dark h-28 w-auto max-w-[480px] object-contain sm:h-32 lg:h-36"
            />
            <p className="mt-6 text-base leading-relaxed text-slate-400 sm:text-lg">
              Manage Google posts, social mirrors, and local sites from one place.
            </p>
          </div>

          <p className="mt-10 hidden text-xs text-slate-600 lg:block">
            Secure admin access · session lasts 7 days on this browser
          </p>
        </aside>

        <section className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-10 lg:px-14 lg:py-16">
          <form
            onSubmit={(e) => void submit(e)}
            className="w-full max-w-md space-y-6 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-7 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8"
          >
            <div>
              <img
                src="/logo.png?v=7"
                alt="Peakwa"
                className="logo-on-dark mb-5 h-16 w-auto max-w-[300px] object-contain sm:h-20"
              />
              <h2 className="text-xl font-semibold tracking-tight text-white">Sign in</h2>
              <p className="mt-1 text-sm text-slate-400">Use your Peakwa admin credentials</p>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-300">Username</span>
              <input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-300">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 pr-11 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error ? (
              <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || !username.trim() || !password}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in
            </button>
            <p className="text-center text-xs text-slate-500 lg:hidden">
              You stay signed in on this browser for 7 days.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
