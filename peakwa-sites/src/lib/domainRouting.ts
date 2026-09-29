/**
 * Custom-domain routing for the middleware. Pure (no imports) so it can be unit tested.
 *
 * On a site's own domain, /about is served from /{slug}/about (a rewrite, the visitor
 * sees /about). On the platform, a site whose domain is live moves there with a 301.
 */

export type DomainRow = { slug?: string; domain?: string; live?: boolean };

export type DomainMap = {
  /** domain -> its site */
  byHost: Map<string, { slug: string; live: boolean }>;
  /** slug -> its domain */
  bySlug: Map<string, { domain: string; live: boolean }>;
  /** www / bare twin -> the domain it redirects to */
  alternates: Map<string, string>;
};

/** The www / bare twin of a domain: www.acme.com <-> acme.com (none for deeper subdomains). */
export function alternateDomain(domain: string): string | null {
  if (domain.startsWith('www.')) return domain.slice(4);
  return domain.split('.').length === 2 ? `www.${domain}` : null;
}

export function buildDomainMap(rows: DomainRow[]): DomainMap {
  const map: DomainMap = { byHost: new Map(), bySlug: new Map(), alternates: new Map() };
  for (const row of rows) {
    if (!row?.slug || !row?.domain) continue;
    const domain = row.domain.toLowerCase();
    const slug = row.slug.toLowerCase();
    const live = row.live === true;
    map.byHost.set(domain, { slug, live });
    map.bySlug.set(slug, { domain, live });
    const alternate = alternateDomain(domain);
    if (alternate) map.alternates.set(alternate, domain);
  }
  // A twin that is itself some site's domain is served as that site.
  for (const host of map.byHost.keys()) map.alternates.delete(host);
  return map;
}

/** "WWW.Acme.com:443" -> "www.acme.com". */
export function normalizeHost(host: string | null | undefined): string {
  return String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export type DomainRoute =
  /** Serve this internal path instead (the address bar keeps the visitor's URL). */
  | { kind: 'rewrite'; path: string; slug: string }
  /** Answer 301 with this location (absolute, or a path on the same host). */
  | { kind: 'redirect'; location: string }
  | null;

/**
 * What to do with a request. `pathname` is as received (already decoded by Next);
 * `search` includes its "?" or is "".
 */
export function routeRequest(host: string, pathname: string, search: string, map: DomainMap): DomainRoute {
  // www.acme.com <-> acme.com: one address per site.
  const canonical = map.alternates.get(normalizeHost(host));
  if (canonical) return { kind: 'redirect', location: `https://${canonical}${pathname}${search}` };

  const onDomain = map.byHost.get(normalizeHost(host));
  if (onDomain) {
    const prefix = `/${onDomain.slug}`;
    // A link with the old /{slug}/ prefix on the domain: drop the prefix.
    if (pathname.toLowerCase() === prefix || pathname.toLowerCase().startsWith(`${prefix}/`)) {
      return { kind: 'redirect', location: `${pathname.slice(prefix.length) || '/'}${search}` };
    }
    return { kind: 'rewrite', path: pathname === '/' ? prefix : `${prefix}${pathname}`, slug: onDomain.slug };
  }

  // Platform address: once the site's domain is live, every page moves there.
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const target = map.bySlug.get(match[1].toLowerCase());
  if (!target?.live) return null;
  return { kind: 'redirect', location: `https://${target.domain}${match[2] ?? '/'}${search}` };
}
