/**
 * Where a site's pages live. Pure (no config imports) so it can be unit tested.
 *
 * A site is served at {platform}/{slug}/... until its own domain is verified; from
 * then on every link, canonical URL, sitemap entry and schema URL uses
 * https://{domain}/... (and the platform address answers 301 to it).
 */

export type SiteAddress = {
  slug: string;
  customDomain?: string | null;
  customDomainVerifiedAt?: string | null;
};

/** The site's own domain once it is live, else null. */
export function liveDomain(site: SiteAddress): string | null {
  return site.customDomain && site.customDomainVerifiedAt ? site.customDomain : null;
}

/** Prefix for the site's links: "" on its own domain, "/{slug}" on the platform. */
export function siteBasePath(site: SiteAddress): string {
  return liveDomain(site) ? '' : `/${site.slug}`;
}

/** Link to a page of the site. `path` is "" (home) or starts with "/". */
export function sitePath(site: SiteAddress, path = ''): string {
  return `${siteBasePath(site)}${path}` || '/';
}

/** Link to a page, from a prefix made by siteBasePath (for components that only get the prefix). */
export function joinBase(base: string, path = ''): string {
  return `${base}${path}` || '/';
}

/** The scheme + host the site's paths hang off: https://{domain}, or the platform address. */
export function siteOrigin(site: SiteAddress, platformBase: string): string {
  const domain = liveDomain(site);
  return domain ? `https://${domain}` : platformBase.replace(/\/$/, '');
}

/** Absolute URL of a page of the site (canonical URLs, sitemap, schema markup). */
export function siteUrl(site: SiteAddress, platformBase: string, path = ''): string {
  return `${siteOrigin(site, platformBase)}${siteBasePath(site)}${path}`;
}
