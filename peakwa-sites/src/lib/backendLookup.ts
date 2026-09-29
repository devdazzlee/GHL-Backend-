/**
 * The backend answered with an error, or not at all. Pages let this throw: when a
 * cached page is being refreshed, Next keeps serving the last good version and tries
 * again on a later request, instead of caching "Site Not Found" for a live site.
 */
export class BackendUnavailableError extends Error {
  constructor(url: string, reason: string) {
    super(`Backend unavailable for ${url} (${reason})`);
    this.name = 'BackendUnavailableError';
  }
}

/** True while `next build` prerenders pages (not when the built server runs). */
export function isBuildPhase(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEXT_PHASE === 'phase-production-build';
}

/**
 * Result of a lookup whose absence shows a 404 page. Only a real 404 from the backend
 * means "not found"; any other failure (5xx, 401/403, 429, no response) throws.
 *
 * During the build it returns null instead, as before: the build prerenders every
 * site, and one backend hiccup must not fail a deploy. That page refreshes within
 * the hour like any other.
 */
export function lookupResult(
  url: string,
  res: Response | null,
  { build = isBuildPhase() }: { build?: boolean } = {},
): Response | null {
  if (res?.ok) return res;
  if (res?.status === 404) return null;

  const reason = res ? `HTTP ${res.status}` : 'no response';
  if (build) {
    console.warn(JSON.stringify({ event: 'api_lookup_failed_during_build', url, reason }));
    return null;
  }
  throw new BackendUnavailableError(url, reason);
}
