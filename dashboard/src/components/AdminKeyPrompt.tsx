import { useEffect, useState } from 'react';
import { ADMIN_KEY_REQUIRED_EVENT, setAdminKey } from '../lib/adminKey';

/**
 * Asks for the admin API key when the backend answers 401 on a protected
 * endpoint. The key is stored for this tab session, then the page reloads so
 * the failed request runs again.
 */
export function AdminKeyPrompt() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  useEffect(() => {
    const onRequired = () => setOpen(true);
    window.addEventListener(ADMIN_KEY_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(ADMIN_KEY_REQUIRED_EVENT, onRequired);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          setAdminKey(value);
          window.location.reload();
        }}
      >
        <h2 className="text-lg font-semibold text-white">Admin key required</h2>
        <p className="text-sm text-slate-400">
          Enter your admin API key. It is kept only for this browser tab.
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
