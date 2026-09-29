import { useState, type FormEvent } from 'react';
import { Loader2, Lock } from 'lucide-react';
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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Sign in to Peakwa</h1>
            <p className="text-xs text-slate-500">GBP Automation dashboard</p>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm text-slate-300">Username</span>
          <input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-slate-300">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
          />
        </label>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sign in
        </button>
        <p className="text-center text-xs text-slate-500">You stay signed in on this browser for 7 days.</p>
      </form>
    </div>
  );
}
