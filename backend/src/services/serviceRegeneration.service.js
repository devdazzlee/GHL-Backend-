import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { generateServiceContent, serviceSlugOf } from './serviceGeneration.service.js';
import { getOrGenerateServicePage } from './servicePage.service.js';
import { revalidateSiteFrontendCache } from './siteRevalidation.service.js';

/**
 * "Regenerate this service": rewrites ONE service and nothing else.
 *
 * Rewritten: its short + full description and icon (name and URL stay), its line in
 * the home page's service list, and its own page (overview, process, FAQs; in the
 * background). Hand edits made to this service are replaced, because that is what was
 * asked for; every other hand edit on the site (other services, home, about, contact,
 * other service pages) is kept exactly as it is.
 */

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const SERVICE_FIELD_PATH = /^services\.\d+\./;

/**
 * The site's recorded hand edits without this service's: edits under services.N on the
 * services and home pages anchored to its title, and all edits to its own page.
 * Pure. Returns { edits, removed } (removed = how many edits were dropped).
 */
export function dropServiceEdits(contentEditsRaw, title, serviceSlug) {
  const edits = structuredClone(parseJson(contentEditsRaw, {}));
  let removed = 0;
  for (const page of ['services', 'home']) {
    for (const [path, edit] of Object.entries(edits[page] ?? {})) {
      if (SERVICE_FIELD_PATH.test(path) && edit?.anchor === title) {
        delete edits[page][path];
        removed += 1;
      }
    }
    if (edits[page] && Object.keys(edits[page]).length === 0) delete edits[page];
  }
  const ownPage = `service:${serviceSlug}`;
  if (edits[ownPage]) {
    removed += Object.keys(edits[ownPage]).length;
    delete edits[ownPage];
  }
  return { edits, removed };
}

export async function regenerateService(
  siteId,
  serviceSlug,
  {
    generate = generateServiceContent,
    regeneratePage = getOrGenerateServicePage,
    revalidateFn = revalidateSiteFrontendCache,
  } = {},
) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });

  const servicesContent = parseJson(site.servicesContent, {});
  const homeContent = parseJson(site.homeContent, {});
  const services = Array.isArray(servicesContent.services) ? [...servicesContent.services] : [];
  const index = services.findIndex((s) => serviceSlugOf(s?.title) === serviceSlug);
  if (index === -1) {
    throw new AppError('This site has no such service.', 404, { code: 'SERVICE_NOT_FOUND' });
  }
  const current = services[index];

  const fresh = await generate(site, current.title);
  services[index] = { ...current, ...fresh, title: current.title };

  const homeServices = Array.isArray(homeContent.services)
    ? homeContent.services.map((s) =>
        s?.title === current.title ? { ...s, description: fresh.shortDescription, icon: fresh.icon } : s,
      )
    : homeContent.services;

  const { edits, removed } = dropServiceEdits(site.contentEdits, current.title, serviceSlug);

  const updated = await prisma.generatedSite.update({
    where: { id: site.id },
    data: {
      servicesContent: JSON.stringify({ ...servicesContent, services }),
      homeContent: JSON.stringify({ ...homeContent, services: homeServices }),
      contentEdits: JSON.stringify(edits),
    },
  });
  await revalidateFn(site.slug);
  console.info(
    JSON.stringify({ event: 'service_regenerated', siteId: site.id, serviceSlug, handEditsReplaced: removed }),
  );

  // Its own page takes longer (three AI units): rebuild it in the background.
  void regeneratePage(updated, serviceSlug, services[index]).then(
    () => revalidateFn(site.slug),
    (error) =>
      console.warn(JSON.stringify({ event: 'service_page_regenerate_failed', siteId: site.id, serviceSlug, error: error?.message })),
  );

  return { site: updated, service: services[index], handEditsReplaced: removed };
}
