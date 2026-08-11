/**
 * Warm dedicated service page cache rows for a site (or all sites).
 * Run after backfillContent once OpenAI credits are available.
 *
 * Usage: node src/scripts/warmServicePages.js [siteSlug]
 */
import prisma from '../database/client.js';
import { env } from '../config/env.js';
import { revalidateSiteFrontendCache } from '../services/siteRevalidation.service.js';

function slugifyServiceTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function apiBaseUrl() {
  const port = env.PORT || 4000;
  return `http://127.0.0.1:${port}`;
}

async function warmSite(site) {
  let services = [];
  try {
    const parsed = JSON.parse(site.servicesContent || '{}');
    services = Array.isArray(parsed?.services) ? parsed.services : [];
  } catch {
    services = [];
  }

  const base = apiBaseUrl();
  let ok = 0;
  let failed = 0;

  for (const service of services) {
    const serviceSlug = slugifyServiceTitle(service?.title);
    if (!serviceSlug) continue;
    const url = `${base}/phase4/sites/${encodeURIComponent(site.slug)}/services/${encodeURIComponent(serviceSlug)}`;
    try {
      const res = await fetch(url);
      if (res.ok) ok += 1;
      else failed += 1;
      console.info(
        JSON.stringify({
          event: 'warm_service_page',
          slug: site.slug,
          serviceSlug,
          status: res.status,
          ok: res.ok,
        }),
      );
    } catch (error) {
      failed += 1;
      console.warn(
        JSON.stringify({
          event: 'warm_service_page_failed',
          slug: site.slug,
          serviceSlug,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  await revalidateSiteFrontendCache(site.slug);
  return { ok, failed, total: services.length };
}

async function main() {
  const targetSlug = process.argv[2]?.trim();
  const sites = await prisma.generatedSite.findMany({
    where: targetSlug ? { slug: targetSlug } : undefined,
    select: { id: true, slug: true, servicesContent: true },
    orderBy: { createdAt: 'asc' },
  });

  if (sites.length === 0) {
    console.warn(JSON.stringify({ event: 'warm_service_pages_no_sites', targetSlug: targetSlug ?? null }));
    return;
  }

  console.info(JSON.stringify({ event: 'warm_service_pages_start', total: sites.length }));

  for (const site of sites) {
    const result = await warmSite(site);
    console.info(JSON.stringify({ event: 'warm_service_pages_site_done', slug: site.slug, ...result }));
  }

  console.info(JSON.stringify({ event: 'warm_service_pages_complete' }));
}

main()
  .catch((e) => {
    console.error(
      JSON.stringify({ event: 'warm_service_pages_fatal', error: e?.message ?? String(e) }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
