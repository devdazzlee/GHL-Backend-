import { SITE_BASE_URL } from '@/src/config';
import { siteOrigin, siteUrl, type SiteAddress } from '@/src/lib/siteUrls';

/** Absolute URL of a page of the site, on its own domain once that is live. */
export function siteUrlFor(site: SiteAddress, path = ''): string {
  return siteUrl(site, SITE_BASE_URL, path);
}

/** https://{domain} once live, else the platform address (for absolute URLs from site paths). */
export function siteOriginFor(site: SiteAddress): string {
  return siteOrigin(site, SITE_BASE_URL);
}
