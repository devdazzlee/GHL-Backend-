import { cache } from 'react';
import { API_URL, IS_SEARCH_INDEXABLE } from '@/src/config/config';
import { ALL_SITES_CACHE_TAG, siteCacheTag } from '@/src/lib/siteCache';
import type { GeneratedSite, LocationPage } from './types';

type FetchCacheOptions = {
  revalidate: number;
  tags: string[];
};

function fetchInit(cache: FetchCacheOptions): RequestInit {
  if (!IS_SEARCH_INDEXABLE) {
    return { cache: 'no-store' };
  }

  return { next: cache };
}

export const getSiteBySlug = cache(async (slug: string): Promise<GeneratedSite | null> => {
  const res = await fetch(
    `${API_URL}/phase4/sites/${encodeURIComponent(slug)}`,
    fetchInit({ revalidate: 3600, tags: [ALL_SITES_CACHE_TAG, siteCacheTag(slug)] }),
  );
  if (!res.ok) return null;
  const data = await res.json();
  const site = (data.data?.site as GeneratedSite | undefined) || null;
  // Public storefront only serves ACTIVE sites; INACTIVE/PENDING must not open.
  if (!site || site.status !== 'ACTIVE') return null;
  return site;
});

/** Loads every ACTIVE site for the platform sitemap (paginated API). */
export async function getAllActiveSites(): Promise<GeneratedSite[]> {
  const sites: GeneratedSite[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await fetch(
      `${API_URL}/phase4/sites?status=ACTIVE&limit=100&page=${page}`,
      fetchInit({ revalidate: 3600, tags: [ALL_SITES_CACHE_TAG] }),
    );
    if (!res.ok) break;

    const data = await res.json();
    const batch: GeneratedSite[] = data.data?.sites ?? [];
    sites.push(...batch);

    totalPages = Number(data.data?.pagination?.totalPages ?? 1);
    page += 1;
  }

  return sites;
}

export async function getAllSites(): Promise<GeneratedSite[]> {
  return getAllActiveSites();
}

export async function getLocationPages(slug: string): Promise<LocationPage[]> {
  const res = await fetch(
    `${API_URL}/phase4/sites/${encodeURIComponent(slug)}/location-pages`,
    fetchInit({
      revalidate: 3600,
      tags: [siteCacheTag(slug), `${siteCacheTag(slug)}-locations`],
    }),
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.data?.pages || [];
}

export async function getServicePageContent(slug: string, serviceSlug: string) {
  const res = await fetch(
    `${API_URL}/phase4/sites/${encodeURIComponent(slug)}/services/${encodeURIComponent(serviceSlug)}`,
    fetchInit({
      revalidate: 86400,
      tags: [siteCacheTag(slug), `${siteCacheTag(slug)}-service-${serviceSlug}`],
    }),
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.content || null;
}
