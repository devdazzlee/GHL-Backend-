import { AppError } from '../utils/AppError.js';
import { getSchemaForIndustry } from './industrySchema.service.js';
import { buildSeoRequirements } from './seoMetadata.service.js';
import { FLOORS, TARGETS } from './contentContract.js';
import { generateUnit } from './contentUnit.runner.js';

/**
 * One service's content from just its name: short description, full description and
 * icon, written the same way (industry prompt, SEO rules, length targets) as the
 * services of a newly generated site.
 */

/** Icons the site renderer can draw (peakwa-sites/src/lib/iconMap.tsx); others show a wrench. */
export const SERVICE_ICONS = [
  'wrench', 'zap', 'droplets', 'wind', 'flame', 'star', 'check-circle', 'phone', 'clock', 'map-pin',
  'shield', 'award', 'users', 'settings', 'home', 'car', 'truck', 'building', 'heart', 'leaf',
  'alert-triangle', 'thumbs-up', 'package', 'refresh-cw', 'dollar-sign', 'search', 'heater',
  'air-conditioning', 'tools',
];

/** "  roof   REPAIR " -> "roof REPAIR" (the name as typed, tidied). */
export function normalizeServiceTitle(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function validateServiceTitle(title) {
  if (title.length < 2 || title.length > 80) {
    throw new AppError('Service name must be 2-80 characters.', 400, { code: 'INVALID_SERVICE_TITLE' });
  }
}

/** Same URL key the site uses for a service page. */
export function serviceSlugOf(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function pickIcon(value) {
  const name = String(value ?? '')
    .toLowerCase()
    .replace(/^lucide[-:\s]+/, '')
    .trim()
    .replace(/\s+/g, '-');
  return SERVICE_ICONS.includes(name) ? name : 'wrench';
}

function countWords(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean).length;
}

/**
 * { shortDescription, fullDescription, icon } for a service of this site. Both AI
 * calls run in parallel (about 10-20 seconds in total).
 */
export async function generateServiceContent(
  site,
  title,
  { generate = generateUnit, schemaFor = getSchemaForIndustry } = {},
) {
  const schema = await schemaFor(site.industry);
  const businessData = {
    businessName: site.businessName,
    industry: site.industry,
    city: site.city,
    state: site.state,
    description: site.description,
  };
  const who = `${site.businessName}, a ${site.industry} business in ${site.city}, ${site.state}`;

  const [summary, full] = await Promise.all([
    generate({
      unitId: 'services.catalogEntry',
      systemPrompt: schema.systemPrompt,
      userPrompt: [
        `Write the services-catalog entry for "${title}" offered by ${who}.`,
        buildSeoRequirements(businessData),
        'Return ONLY JSON: { "shortDescription": "30-45 words, specific to this service and city", "icon": "one of the allowed icons" }',
        `Allowed icons: ${SERVICE_ICONS.join(', ')}. Pick the closest match.`,
      ].join(' '),
      maxTokens: 400,
    }),
    generate({
      unitId: 'services.fullDescription',
      systemPrompt: schema.systemPrompt,
      userPrompt: [
        `Write the fullDescription for "${title}" offered by ${who}.`,
        buildSeoRequirements(businessData),
        `Return ONLY JSON: { "fullDescription": "${TARGETS.serviceFullDescription.min}-${TARGETS.serviceFullDescription.max} words of in-depth detail" }`,
        `HARD MINIMUM ${FLOORS.serviceFullDescription} words.`,
      ].join(' '),
      maxTokens: 1200,
    }),
  ]);

  const shortDescription = String(summary?.shortDescription ?? '').trim();
  const fullDescription = String(full?.fullDescription ?? '').trim();
  if (countWords(shortDescription) < 10 || countWords(fullDescription) < FLOORS.serviceFullDescription * 0.8) {
    throw new AppError('The AI returned too little text for this service. Try again.', 502, {
      code: 'SERVICE_GENERATION_SHORT',
    });
  }
  return { shortDescription, fullDescription, icon: pickIcon(summary?.icon) };
}
