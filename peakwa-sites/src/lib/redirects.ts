/**
 * Old site addresses (after a site's URL changed). /{oldSlug}/{rest} answers
 * 301 to /{currentSlug}/{rest}, keeping the rest of the path and the query.
 */

export type RedirectMap = Map<string, string>;

export function buildRedirectMap(rows: Array<{ from?: string; to?: string }>): RedirectMap {
  const map: RedirectMap = new Map();
  for (const row of rows) {
    if (row?.from && row?.to && row.from !== row.to) map.set(row.from.toLowerCase(), row.to);
  }
  return map;
}

/** The URL (path + query) to redirect to, or null when the first path segment is not an old address. */
export function redirectTarget(pathname: string, search: string, map: RedirectMap): string | null {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const to = map.get(decodeURIComponent(match[1]).toLowerCase());
  if (!to) return null;
  return `/${to}${match[2] ?? ''}${search}`;
}
