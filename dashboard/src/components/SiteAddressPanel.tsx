import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../api/client';
import type { Phase4GeneratedSite } from '../api/endpoints';
import { Button } from './ui/button';

interface Props {
  siteId: string;
  slug: string;
  siteBaseUrl: string;
  onChanged: (site: Phase4GeneratedSite) => void;
}

type Envelope<T> = { data: T };

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Change the site's address. Every old link (all pages) keeps working as a permanent redirect. */
export function SiteAddressPanel({ siteId, slug, siteBaseUrl, onChanged }: Props) {
  const [value, setValue] = useState(slug);
  const [oldAddresses, setOldAddresses] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Envelope<{ redirects: Array<{ fromSlug: string }> }>>(`/phase4/sites/${siteId}/redirects`).then(
      ({ data }) => !cancelled && setOldAddresses(data.data.redirects.map((r) => r.fromSlug)),
      () => !cancelled && setOldAddresses([]),
    );
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const next = toSlug(value);
  const changed = next.length >= 3 && next !== slug;

  async function submit() {
    if (
      !window.confirm(
        `Change this site's address?\n\nFrom: ${siteBaseUrl}/${slug}\nTo:   ${siteBaseUrl}/${next}\n\nEvery old link (home, services, city pages, blog, keyword pages) will permanently redirect to the new address.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<Envelope<{ site: Phase4GeneratedSite }>>(`/phase4/sites/${siteId}/change-url`, { slug: next });
      onChanged(data.data.site);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the address');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-800 p-4">
      <p className="font-medium text-white">Site address</p>
      <p className="mt-1 text-xs text-slate-500">
        Current: <span className="font-mono">{siteBaseUrl}/{slug}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-500">{siteBaseUrl}/</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
        />
        <Button type="button" variant="outline" disabled={busy || !changed} onClick={() => void submit()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Change address
        </Button>
      </div>
      {changed ? <p className="mt-2 text-xs text-slate-400">New address: {siteBaseUrl}/{next}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      {oldAddresses && oldAddresses.length > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Old addresses that redirect here: {oldAddresses.map((s) => `/${s}`).join(', ')}
        </p>
      ) : null}
    </div>
  );
}
