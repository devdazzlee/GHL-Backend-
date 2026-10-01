import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { listPhotoCredits, type PhotoCredit, type SitePhoto } from '../api/siteEditor';
import { Button } from './ui/button';

/** "Photo by Jane Doe on Pexels" with links, or what is known so far. */
export function PhotoCreditLine({ credit }: { credit: PhotoCredit | null }) {
  if (!credit || credit.status === 'NOT_STOCK') return null;
  if (credit.status !== 'KNOWN') {
    const note = credit.status === 'PENDING' ? 'credit being looked up' : 'no longer on Pexels';
    return <span className="text-[11px] text-slate-500">Pexels photo ({note})</span>;
  }
  const name = credit.photographer ?? 'Unknown photographer';
  return (
    <span className="text-[11px] text-slate-400">
      Photo by{' '}
      {credit.photographerUrl ? (
        <a href={credit.photographerUrl} target="_blank" rel="noreferrer" className="underline hover:text-slate-200">
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

/** Every stock photo on the site with its photographer and where it is used (like an IMAGE-CREDITS file). */
export function PhotoCreditsPanel({ siteId }: { siteId: string }) {
  const [data, setData] = useState<{ photos: SitePhoto[]; pending: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listPhotoCredits(siteId)
      .then(
        (d) => !cancelled && (setData(d), setError(null)),
        (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load photo credits'),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [siteId, reloads]);

  if (!data) return error ? <p className="text-sm text-red-400">{error}</p> : <Loader2 className="h-4 w-4 animate-spin text-slate-500" />;
  const stock = data.photos.filter((p) => p.credit.status !== 'NOT_STOCK');
  const own = data.photos.length - stock.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-400">
          Stock photos on this site come from Pexels (free to use, credit appreciated). On the site, each photo&apos;s
          alt text is Pexels&apos; own description of it, so it never claims to show this business&apos;s team or work.
        </p>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => {
            setLoading(true);
            setReloads((n) => n + 1);
          }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        {stock.length} stock photo{stock.length === 1 ? '' : 's'}
        {own > 0 ? `, ${own} uploaded or from elsewhere` : ''}
        {data.pending > 0 ? ` · ${data.pending} credit${data.pending === 1 ? '' : 's'} still being looked up (refresh in a minute)` : ''}
      </p>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <ul className="divide-y divide-slate-800 rounded border border-slate-800">
        {stock.map((photo) => (
          <li key={photo.url} className="flex gap-3 p-3">
            <img src={photo.url} alt="" loading="lazy" className="h-16 w-24 shrink-0 rounded object-cover" />
            <div className="min-w-0 space-y-1">
              <PhotoCreditLine credit={photo.credit} />
              {photo.credit.status === 'KNOWN' && photo.credit.alt ? (
                <p className="text-xs text-slate-300">Alt text: {photo.credit.alt}</p>
              ) : null}
              <p className="text-xs text-slate-500">Used on: {photo.usedIn.join(' · ')}</p>
            </div>
          </li>
        ))}
        {stock.length === 0 ? <li className="p-3 text-sm text-slate-500">No stock photos on this site.</li> : null}
      </ul>
    </div>
  );
}
