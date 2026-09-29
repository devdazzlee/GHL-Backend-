import { API_URL } from '@/src/config';
import { buildDomainMap, type DomainMap } from '@/src/lib/domainRouting';

/** Every active site's custom domain, straight from the backend (null if it can't answer). */
export async function fetchDomainMap(): Promise<DomainMap | null> {
  try {
    const key = process.env.SITE_RENDERER_API_KEY?.trim();
    const res = await fetch(`${API_URL}/phase4/custom-domains`, {
      headers: key ? { 'x-site-api-key': key } : {},
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return buildDomainMap(Array.isArray(data?.data?.domains) ? data.data.domains : []);
  } catch {
    return null;
  }
}
