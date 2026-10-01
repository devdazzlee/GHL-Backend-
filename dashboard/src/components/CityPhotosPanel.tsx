import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getCityPhotoReport, repickMismatchedCityPhotos, type CityPhotoReport, type CityPhotoRepick } from '../api/siteEditor';
import { Button } from './ui/button';

/**
 * City page photos: which show the town, which are generic, and which show somewhere
 * else (judged by Pexels' description), with a button to re-pick only the last kind.
 */
export function CityPhotosPanel({ siteId }: { siteId: string }) {
  const [report, setReport] = useState<CityPhotoReport | null>(null);
  const [reloads, setReloads] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CityPhotoRepick | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCityPhotoReport(siteId).then(
      (r) => !cancelled && setReport(r),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to check city photos'),
    );
    return () => {
      cancelled = true;
    };
  }, [siteId, reloads]);

  async function repick() {
    setBusy(true);
    setError(null);
    try {
      setResult(await repickMismatchedCityPhotos(siteId));
      setConfirming(false);
      setReloads((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-picking failed');
    } finally {
      setBusy(false);
    }
  }

  if (!report) return error ? <p className="text-sm text-red-400">{error}</p> : null;
  const { summary } = report;
  const mismatched = report.pages.filter((p) => p.status === 'MISMATCHED');

  return (
    <div className="rounded-lg border border-slate-800 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-200">City photos</p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.matchesTown} show their town · {summary.generic} generic (no place named) ·{' '}
            <span className={summary.mismatched > 0 ? 'text-amber-400' : undefined}>{summary.mismatched} show somewhere else</span>
            {summary.checking > 0 ? ` · ${summary.checking} still being checked (refresh in a minute)` : ''}
          </p>
        </div>
        {mismatched.length > 0 && !confirming ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
            Re-pick mismatched city photos ({mismatched.length})
          </Button>
        ) : null}
      </div>

      {mismatched.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {mismatched.map((page) => (
            <li key={page.id} className="text-xs text-slate-400">
              <span className="text-slate-200">{page.city}</span>: photo shows {page.names?.length ? page.names.join(' ') : 'another place'}
              {page.description ? <span className="text-slate-500"> (“{page.description}”)</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {confirming ? (
        <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          <p>
            This changes {Math.min(mismatched.length, 10)} live city page{mismatched.length === 1 ? '' : 's'}: each gets a photo of its town, else a
            generic one with no place in it, else no photo. Photos that already fit and uploaded photos are not touched.
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void repick()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Yes, re-pick them
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 text-xs text-slate-400">
          {result.changed.map((c) => (
            <p key={c.city}>
              <span className="text-slate-200">{c.city}</span>: {c.to ? `new photo (“${c.description ?? 'no description'}”)` : 'no suitable photo, now shown without one'}
            </p>
          ))}
          {result.failed.length > 0 ? (
            <p className="text-amber-400">Could not search for {result.failed.join(', ')} this time; their photos were left as they were.</p>
          ) : null}
          {result.stoppedEarly ? <p className="text-amber-400">Pexels asked us to slow down; {result.remaining} left. Try again in 10 minutes.</p> : null}
          {!result.stoppedEarly && result.remaining > 0 ? <p>{result.remaining} more left; click again to continue.</p> : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
