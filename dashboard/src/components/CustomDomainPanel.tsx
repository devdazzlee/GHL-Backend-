import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, ExternalLink, Loader2 } from 'lucide-react';
import api from '../api/client';
import { Button } from './ui/button';

interface Props {
  siteId: string;
  slug: string;
  siteBaseUrl: string;
}

type Envelope<T> = { data: T };

type DnsRecord = { type: string; host: string; name: string; value: string };

type DomainState = {
  domain: string | null;
  alternate: string | null;
  verifiedAt: string | null;
  live: boolean;
  url: string | null;
  dnsRecords: DnsRecord[];
};

type Check = { ok: boolean; problem: string | null; host?: string };

type VerifyResult = {
  verified: boolean;
  checks: { dns: Check; alternateDns: Check | null; https: Check };
  domain: DomainState;
};

function errorMessage(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data;
  return data?.error?.message || data?.message || (err instanceof Error ? err.message : fallback);
}

function CheckLine({ label, check }: { label: string; check: Check }) {
  return (
    <li className="flex items-start gap-2">
      {check.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      )}
      <span>
        <span className="text-slate-300">{label}:</span>{' '}
        <span className={check.ok ? 'text-emerald-300' : 'text-amber-200'}>{check.ok ? 'OK' : check.problem}</span>
      </span>
    </li>
  );
}

/**
 * The site's own domain. Saving one changes nothing for visitors; after DNS and the
 * server are set up, Verify moves the site (links, canonical URLs, sitemap) to it and
 * the platform address starts redirecting there.
 */
export function CustomDomainPanel({ siteId, slug, siteBaseUrl }: Props) {
  const [state, setState] = useState<DomainState | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<'save' | 'verify' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Envelope<{ domain: DomainState }>>(`/phase4/sites/${siteId}/domain`).then(
      ({ data }) => {
        if (cancelled) return;
        setState(data.data.domain);
        setValue(data.data.domain.domain ?? '');
      },
      (err) => !cancelled && setError(errorMessage(err, 'Could not load the domain')),
    );
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  async function save(domain: string | null) {
    setBusy(domain ? 'save' : 'remove');
    setError(null);
    setResult(null);
    try {
      const { data } = await api.put<Envelope<{ domain: DomainState }>>(`/phase4/sites/${siteId}/domain`, { domain });
      setState(data.data.domain);
      setValue(data.data.domain.domain ?? '');
    } catch (err) {
      setError(errorMessage(err, 'Could not save the domain'));
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setBusy('verify');
    setError(null);
    try {
      const { data } = await api.post<Envelope<VerifyResult>>(`/phase4/sites/${siteId}/domain/verify`);
      setResult(data.data);
      setState(data.data.domain);
    } catch (err) {
      setError(errorMessage(err, 'Could not run the check'));
    } finally {
      setBusy(null);
    }
  }

  function confirmSave() {
    const next = value.trim();
    if (!next) return;
    if (
      state?.live &&
      !window.confirm(
        `Replace ${state.domain} with ${next}?\n\nThe site moves back to ${siteBaseUrl}/${slug} until the new domain is set up and verified.`,
      )
    ) {
      return;
    }
    void save(next);
  }

  function confirmRemove() {
    if (
      !window.confirm(
        `Remove ${state?.domain} from this site?\n\nThe site moves back to ${siteBaseUrl}/${slug}${state?.live ? ` and ${state.domain} stops showing it` : ''}. Also run "peakwa-domain remove ${state?.domain}" on the frontend server.`,
      )
    ) {
      return;
    }
    void save(null);
  }

  if (!state) {
    return (
      <div className="mt-6 rounded-lg border border-slate-800 p-4 text-sm text-slate-400">
        {error ?? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading custom domain…
          </span>
        )}
      </div>
    );
  }

  const changed = value.trim().toLowerCase() !== (state.domain ?? '');

  return (
    <div className="mt-6 rounded-lg border border-slate-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-white">Custom domain</p>
        {state.domain ? (
          state.live ? (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">Live</span>
          ) : (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">Not live yet</span>
          )
        ) : null}
      </div>

      {state.live && state.url ? (
        <p className="mt-1 text-xs text-slate-400">
          The site is live at{' '}
          <a href={state.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">
            {state.url} <ExternalLink className="h-3 w-3" />
          </a>
          . <span className="font-mono">{siteBaseUrl}/{slug}</span> redirects there.
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          The site stays at <span className="font-mono">{siteBaseUrl}/{slug}</span> until its own domain is verified.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="www.clientbusiness.com"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
        />
        <Button type="button" variant="outline" disabled={busy !== null || !changed || !value.trim()} onClick={confirmSave}>
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {state.domain ? 'Change domain' : 'Save domain'}
        </Button>
        {state.domain ? (
          <Button type="button" variant="outline" disabled={busy !== null} onClick={confirmRemove}>
            {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Remove
          </Button>
        ) : null}
      </div>

      {state.domain && !state.live ? (
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-300">
          <li>
            At the client&apos;s domain provider, add these DNS records (and delete any other A, AAAA or CNAME records with the
            same names):
            <table className="mt-2 w-full text-left font-mono text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-normal">Type</th>
                  <th className="py-1 pr-3 font-normal">Name</th>
                  <th className="py-1 pr-3 font-normal">Value</th>
                  <th className="py-1 font-normal">For</th>
                </tr>
              </thead>
              <tbody>
                {state.dnsRecords.map((r) => (
                  <tr key={r.host} className="border-t border-slate-800 text-slate-200">
                    <td className="py-1 pr-3">{r.type}</td>
                    <td className="py-1 pr-3">{r.name}</td>
                    <td className="py-1 pr-3">{r.value}</td>
                    <td className="py-1 text-slate-500">{r.host}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
          <li>
            Once DNS has updated (minutes to a few hours), set up the domain and its HTTPS certificate on the frontend server:
            <pre className="mt-2 overflow-x-auto rounded bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">peakwa-domain add {state.domain}</pre>
          </li>
          <li>Click Verify. When both checks pass, the site moves to https://{state.domain}.</li>
        </ol>
      ) : null}

      {state.domain ? (
        <div className="mt-4">
          <Button type="button" disabled={busy !== null} onClick={() => void verify()}>
            {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {state.live ? 'Check again' : 'Verify'}
          </Button>
        </div>
      ) : null}

      {result ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          <CheckLine label={`DNS (${result.checks.dns.host})`} check={result.checks.dns} />
          {result.checks.alternateDns ? (
            <CheckLine label={`DNS (${result.checks.alternateDns.host}, redirects to the domain)`} check={result.checks.alternateDns} />
          ) : null}
          <CheckLine label="HTTPS" check={result.checks.https} />
          {result.verified ? <li className="text-emerald-300">Verified. The site is now served at {result.domain.url}.</li> : null}
        </ul>
      ) : null}

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
