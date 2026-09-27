import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { revalidateSiteFrontendCache } from './siteRevalidation.service.js';

/**
 * Changing a site's URL (its slug) and keeping every old link working.
 *
 * Each old slug is stored once in SiteRedirect, pointing at the site (not at
 * a slug), so renames chain cleanly: after A -> B -> C both A and B send
 * visitors straight to C. The renderer answers /{oldSlug}/{anything} with a
 * 301 to /{currentSlug}/{anything}, so home, services, city pages, blog posts,
 * keyword pages, sitemap and robots.txt all follow.
 */

/** First path segments the renderer uses for itself; a site can never be one of these. */
const RESERVED_SLUGS = new Set(['api', 'design-preview', '_next', 'favicon.ico', 'icon.svg', 'apple-icon.png', 'robots.txt', 'sitemap.xml']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validateSlug(slug) {
  if (!SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 80) {
    throw new AppError('The new address must be 3-80 characters: lowercase letters, numbers and single dashes.', 400, {
      code: 'INVALID_SLUG',
    });
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new AppError('That address is reserved.', 400, { code: 'INVALID_SLUG' });
  }
}

/** True when no site uses the slug and no site's old URL redirects from it. */
export async function isSlugAvailable(slug) {
  if (RESERVED_SLUGS.has(slug)) return false;
  const [site, redirect] = await Promise.all([
    prisma.generatedSite.findUnique({ where: { slug }, select: { id: true } }),
    prisma.siteRedirect.findUnique({ where: { fromSlug: slug }, select: { id: true } }),
  ]);
  return !site && !redirect;
}

/**
 * Moves a site to a new slug and redirects the old one.
 * Renaming back to one of the site's own old slugs is allowed (that redirect is removed).
 */
export async function changeSiteSlug(siteId, requestedSlug, { revalidateFn = revalidateSiteFrontendCache } = {}) {
  const newSlug = normalizeSlug(requestedSlug);
  validateSlug(newSlug);

  const site = await prisma.generatedSite.findUnique({ where: { id: siteId }, select: { id: true, slug: true } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  if (newSlug === site.slug) {
    throw new AppError('That is already this site’s address.', 400, { code: 'SLUG_UNCHANGED' });
  }

  const [taken, oldUrl] = await Promise.all([
    prisma.generatedSite.findUnique({ where: { slug: newSlug }, select: { id: true } }),
    prisma.siteRedirect.findUnique({ where: { fromSlug: newSlug } }),
  ]);
  if (taken || (oldUrl && oldUrl.siteId !== site.id)) {
    throw new AppError('Another site already uses (or used) that address. Choose a different one.', 409, {
      code: 'SLUG_TAKEN',
    });
  }

  const oldSlug = site.slug;
  const [updated] = await prisma.$transaction([
    prisma.generatedSite.update({ where: { id: site.id }, data: { slug: newSlug } }),
    ...(oldUrl ? [prisma.siteRedirect.delete({ where: { fromSlug: newSlug } })] : []),
    prisma.siteRedirect.upsert({
      where: { fromSlug: oldSlug },
      update: { siteId: site.id },
      create: { fromSlug: oldSlug, siteId: site.id },
    }),
  ]);

  // Old pages must stop being served from cache; new ones are built fresh.
  await revalidateFn(oldSlug);
  await revalidateFn(newSlug);
  console.info(JSON.stringify({ event: 'site_slug_changed', siteId: site.id, from: oldSlug, to: newSlug }));

  return { site: updated, oldSlug, newSlug, redirects: await listSiteRedirects(site.id) };
}

/** Old URLs that redirect to this site (dashboard). */
export async function listSiteRedirects(siteId) {
  const rows = await prisma.siteRedirect.findMany({ where: { siteId }, orderBy: { createdAt: 'desc' } });
  return rows.map((r) => ({ fromSlug: r.fromSlug, createdAt: r.createdAt }));
}

/** Every old slug with the site's current slug (renderer middleware). */
export async function getRedirectMap() {
  const rows = await prisma.siteRedirect.findMany({ include: { site: { select: { slug: true } } } });
  return rows
    .filter((r) => r.site?.slug && r.site.slug !== r.fromSlug)
    .map((r) => ({ from: r.fromSlug, to: r.site.slug }));
}
