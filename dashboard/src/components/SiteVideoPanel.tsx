import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getSiteVideo, searchStockVideos, setSiteVideo, type SiteVideoSlot, type StockVideoClip } from '../api/siteEditor';
import { Button } from './ui/button';

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';

function VideoCredit({ credit }: { credit: StockVideoClip['credit'] }) {
  const name = credit.videographer ?? 'Unknown videographer';
  return (
    <span className="text-[11px] text-slate-400">
      Video by{' '}
      {credit.videographerUrl ? (
        <a href={credit.videographerUrl} target="_blank" rel="noreferrer" className="underline hover:text-slate-200">
          {name}
        </a>
      ) : (
        name
      )}{' '}
      on{' '}
      {credit.pageUrl ? (
        <a href={credit.pageUrl} target="_blank" rel="noreferrer" className="underline hover:text-slate-200">
          Pexels
        </a>
      ) : (
        'Pexels'
      )}
    </span>
  );
}

/** Home page stock video: what is shown, who made it, and change or remove it. */
export function SiteVideoPanel({ siteId }: { siteId: string }) {
  const [slot, setSlot] = useState<SiteVideoSlot | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockVideoClip[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSiteVideo(siteId).then(
      (s) => !cancelled && (setSlot(s), setQuery(s.suggestedQuery)),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load the video'),
    );
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  async function act(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  if (!slot) return error ? <p className="text-sm text-red-400">{error}</p> : <Loader2 className="h-4 w-4 animate-spin text-slate-500" />;
  const video = slot.video;

  return (
    <div className="w-full max-w-xl">
      <p className="mb-1 text-xs font-medium text-slate-500">Home page video (About section)</p>
      {video.status === 'SHOWN' ? (
        <>
          <video src={video.url} poster={video.poster} muted loop playsInline controls preload="none" className="aspect-video w-full rounded bg-slate-800 object-cover" />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <VideoCredit credit={video.credit} />
            <span className="text-[11px] text-slate-500">
              {video.label ? `${video.label} · ` : ''}
              {Math.round(video.duration)}s · {video.source === 'AUTO' ? 'picked automatically' : 'chosen'}
            </span>
          </div>
        </>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded bg-slate-800 px-6 text-center text-xs text-slate-500">
          {video.status === 'REMOVED'
            ? 'No video on this site (removed). Choose one to show it again.'
            : 'A video is picked automatically the next time the home page is built.'}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setPicking((p) => !p)}>
          {picking ? 'Close' : 'Change video'}
        </Button>
        {video.status === 'SHOWN' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void act('remove', async () => setSlot(await setSiteVideo(siteId, { remove: true })))}
          >
            {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Remove video
          </Button>
        ) : null}
      </div>

      {picking ? (
        <div className="mt-4 rounded-lg border border-slate-800 p-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act('search', async () => setResults(await searchStockVideos(siteId, query)));
            }}
          >
            <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} placeholder="e.g. HVAC technician" />
            <Button type="submit" variant="outline" disabled={busy !== null || !query.trim()}>
              {busy === 'search' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Search
            </Button>
          </form>
          <p className="mt-2 text-[11px] text-slate-500">Short (4-40 s), silent, landscape clips from Pexels. They play muted and on a loop.</p>
          {results ? (
            results.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No suitable videos found. Try other words.</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {results.map((clip) => (
                  <button
                    key={clip.pexelsId}
                    type="button"
                    disabled={busy !== null}
                    title={clip.label ?? ''}
                    className="group overflow-hidden rounded border border-slate-800 text-left"
                    onClick={() =>
                      void act(`pick-${clip.pexelsId}`, async () => {
                        setSlot(await setSiteVideo(siteId, { pexelsId: clip.pexelsId }));
                        setPicking(false);
                      })
                    }
                  >
                    <img src={clip.poster} alt={clip.label ?? ''} className="h-24 w-full object-cover transition group-hover:opacity-80" />
                    <span className="block truncate px-2 py-1 text-[10px] text-slate-500">
                      {busy === `pick-${clip.pexelsId}` ? 'Saving…' : `${Math.round(clip.duration)}s · ${clip.credit.videographer ?? 'Pexels'}`}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
