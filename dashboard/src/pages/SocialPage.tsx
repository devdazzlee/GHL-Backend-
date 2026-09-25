import { useEffect, useState } from 'react';
import {
  fetchSocialSettings,
  updateSocialSettings,
  type SocialPlatform,
  type SocialPlatformStatus,
  type SocialSettings,
  type SocialSettingsUpdate,
} from '../api/social';
import { ErrorBanner, PageHeader } from '../components/ui';
import { CardGridSkeleton } from '../components/ui/skeleton';
import { useLocations } from '../contexts/LocationsContext';
import { cn } from '../lib/utils';
import { formatDateShort, truncate } from '../utils/format';

const CHANGED_BY_KEY = 'social.changedBy';
const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
};

function readChangedBy(): string {
  try {
    return sessionStorage.getItem(CHANGED_BY_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeChangedBy(value: string) {
  try {
    sessionStorage.setItem(CHANGED_BY_KEY, value);
  } catch {
    // Storage unavailable (private mode); the name just isn't remembered.
  }
}

interface ToggleProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}

function Toggle({ checked, disabled, label, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-emerald-600' : 'bg-slate-700',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function LastResult({ result }: { result: SocialPlatformStatus['lastResult'] }) {
  if (!result) return <span className="text-slate-500">No posts yet</span>;
  const failed = result.status === 'FAILED';
  return (
    <span className={failed ? 'text-red-300' : 'text-slate-300'}>
      {failed ? 'Failed' : 'Sent'} · {formatDateShort(result.at)}
      {failed && result.error ? (
        <span className="block text-xs text-red-300/80" title={result.error}>
          {truncate(result.error, 120)}
        </span>
      ) : null}
    </span>
  );
}

interface PlatformRowProps {
  platform: SocialPlatform;
  status: SocialPlatformStatus;
  busy: boolean;
  onToggle: (next: boolean) => void;
}

function PlatformRow({ platform, status, busy, onToggle }: PlatformRowProps) {
  const label = PLATFORM_LABEL[platform];
  // Turning on an unconnected platform is refused by the API; turning it off is always allowed.
  const cannotEnable = !status.connected && !status.enabled;
  return (
    <div className="rounded-lg bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="truncate text-xs text-slate-400">
            {status.connected ? (
              <>Connected: {status.account?.name}</>
            ) : (
              <span className="text-amber-300">Not connected in GHL</span>
            )}
          </p>
        </div>
        <Toggle
          checked={status.enabled}
          disabled={busy || cannotEnable}
          label={`${label} posting`}
          onChange={onToggle}
        />
      </div>
      <div className="mt-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last result</p>
        <LastResult result={status.lastResult} />
      </div>
      {status.needsReconnect ? (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Needs reconnect: GHL says the {label} connection is no longer valid. Reconnect it in
          GHL → Marketing → Social Planner; the next post picks up the new connection.
        </p>
      ) : null}
    </div>
  );
}

interface BusinessCardProps {
  businessName: string;
  locationId: string;
  changedBy: string;
}

function BusinessCard({ businessName, locationId, changedBy }: BusinessCardProps) {
  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSocialSettings(locationId).then(
      (loaded) => {
        if (!cancelled) setSettings(loaded);
      },
      (err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load social settings');
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  async function save(body: SocialSettingsUpdate) {
    setBusy(true);
    setError(null);
    try {
      const name = changedBy.trim();
      setSettings(await updateSocialSettings(locationId, name ? { ...body, changedBy: name } : body));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  const mode = settings?.socialPostingMode;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-white">{businessName}</h2>
          <p className="text-xs text-slate-400">
            {mode === 'LIVE' && 'Social posting on'}
            {mode === 'OFF' && 'Social posting off'}
            {mode === 'DRAFT' && 'Draft (test) mode: posts go to GHL as drafts only'}
          </p>
        </div>
        {settings ? (
          <Toggle
            checked={mode !== 'OFF'}
            disabled={busy}
            label={`Social posting for ${businessName}`}
            onChange={(on) => void save({ socialPostingMode: on ? 'LIVE' : 'OFF' })}
          />
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      {settings ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(['facebook', 'instagram'] as const).map((platform) => (
            <PlatformRow
              key={platform}
              platform={platform}
              status={settings.platforms[platform]}
              busy={busy}
              onToggle={(on) =>
                void save(platform === 'facebook' ? { facebookEnabled: on } : { instagramEnabled: on })
              }
            />
          ))}
        </div>
      ) : !error ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : null}
    </div>
  );
}

export function SocialPage() {
  const { locations, loading, error } = useLocations();
  const [changedBy, setChangedBy] = useState(readChangedBy);

  return (
    <div>
      <PageHeader
        title="Social Posting"
        description="Facebook and Instagram copies of each Google post, sent through GHL. Changes apply to future posts only."
      />

      <label className="mb-6 block max-w-sm text-sm">
        <span className="text-slate-400">Your name (recorded with each change)</span>
        <input
          type="text"
          value={changedBy}
          maxLength={100}
          onChange={(e) => {
            setChangedBy(e.target.value);
            writeChangedBy(e.target.value);
          }}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
        />
      </label>

      {error ? <ErrorBanner message={error} /> : null}

      {loading ? (
        <CardGridSkeleton count={2} />
      ) : (
        <div className="space-y-6">
          {locations.map((loc) => (
            <BusinessCard
              key={loc.id}
              businessName={loc.businessName}
              locationId={loc.id}
              changedBy={changedBy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
