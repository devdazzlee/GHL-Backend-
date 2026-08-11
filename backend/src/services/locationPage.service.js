import OpenAI from 'openai';
import prisma from '../database/client.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { getSchemaForIndustry } from './industrySchema.service.js';
import { fetchPexelsImageByQuery } from './pexels.service.js';
import { buildSeoRequirements, ensureSeoMetadata } from './seoMetadata.service.js';
import {
  FLOORS,
  TARGETS,
  LENGTH_CRITICAL_TEMPERATURE,
  LENGTH_PRIORITY_PREAMBLE,
  countWords,
  validateUnit,
} from './contentContract.js';
import { ContentUnitError, generateUnit } from './contentUnit.runner.js';
import { attachSeoExtra, buildSeoExtraLinkTargets } from './seoExtra.service.js';

const OPENAI_CONTENT_MODEL = 'gpt-4o';

const LOCATION_PAGE_SCHEMA = {
  heroHeading: 'city name included, max 10 words',
  heroSubheading: 'city and service mention, max 20 words',
  localIntro: `${TARGETS.locationLocalIntro.min}-${TARGETS.locationLocalIntro.max} words specific to this city with local landmarks, neighborhoods, community details, and industry keywords (HARD MINIMUM ${FLOORS.locationLocalIntro})`,
  whyLocal: `${TARGETS.locationWhyLocal.min}-${TARGETS.locationWhyLocal.max} words on why this business is the best choice for residents of this city (HARD MINIMUM ${FLOORS.locationWhyLocal})`,
  serviceArea: `${TARGETS.locationServiceArea.min}-${TARGETS.locationServiceArea.max} words about serving this city and nearby areas (HARD MINIMUM ${FLOORS.locationServiceArea})`,
  localStats: {
    yearsServing: 'ONLY if known for this business — otherwise omit or use empty string. Never invent years.',
    customersServed: 'ONLY if known — otherwise omit or empty. Never invent customer counts.',
    responseTime: 'realistic industry response time phrase e.g. Same-day or Within 24 hours',
  },
  process: [
    { step: 'contact step specific to this city, max 6 words', description: '40-50 words' },
    { step: 'assessment step, max 6 words', description: '40-50 words' },
    { step: 'service delivery step, max 6 words', description: '40-50 words' },
  ],
  faqs: [
    {
      question: 'Do you serve the city area question mentioning city name',
      answer: `${TARGETS.faqAnswer.min}-${TARGETS.faqAnswer.max} words mentioning neighborhoods and service area`,
    },
    {
      question: 'How quickly can you reach the city question',
      answer: `${TARGETS.faqAnswer.min}-${TARGETS.faqAnswer.max} words with realistic response time for this industry`,
    },
    {
      question: 'What industry services are available in the city question',
      answer: `${TARGETS.faqAnswer.min}-${TARGETS.faqAnswer.max} words listing specific services offered in this city`,
    },
  ],
  seo: {
    title: '50-60 characters including city, industry, and business name (minimum 50)',
    metaDescription:
      '120-155 characters including city, state, industry keywords, and call to action (minimum 120)',
  },
};

const DEFAULT_LOCATION_COUNT = 6;

function slugify(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateLocations(locations) {
  if (!Array.isArray(locations) || locations.length === 0) {
    throw new AppError('Field `locations` must be a non-empty array.', 400, {
      code: 'INVALID_BODY',
    });
  }

  return locations.map((loc, index) => {
    if (!loc || typeof loc !== 'object') {
      throw new AppError(`locations[${index}] must be an object.`, 400, { code: 'INVALID_BODY' });
    }

    const city = String(loc.city ?? '').trim();
    const county = String(loc.county ?? '').trim();
    const state = String(loc.state ?? 'NJ').trim() || 'NJ';

    if (!city) {
      throw new AppError(`locations[${index}].city is required.`, 400, { code: 'INVALID_BODY' });
    }
    if (!county) {
      throw new AppError(`locations[${index}].county is required.`, 400, { code: 'INVALID_BODY' });
    }

    return { city, county, state };
  });
}

function buildLocationSeoRequirements({ businessName, industry, city, state }) {
  return [
    buildSeoRequirements({ businessName, industry, city, state }),
    `Use long tail keywords related to ${industry} services in ${city}.`,
    'Mention real local landmarks, neighborhoods, and community details for this city.',
  ].join(' ');
}

function buildLocationPagePrompt(businessData, location, site, systemPrompt) {
  const { businessName, industry, city, state, phone, email, description } = businessData;
  const targetCity = location.city;
  const targetCounty = location.county;
  const targetState = location.state;

  const details = [
    `Target city: ${targetCity}, ${targetCounty} County, ${targetState}.`,
    `Main business location: ${site.city}, ${site.state}.`,
    `Phone: ${phone ?? 'not provided'}.`,
    email ? `Email: ${email}.` : null,
    description ? `Description: ${description}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const seoRequirements = buildLocationSeoRequirements({
    businessName,
    industry,
    city: targetCity,
    state: targetState,
  });

  return [
    `Generate a detailed location landing page for ${businessName}, a ${industry} business, targeting ${targetCity}, ${targetCounty} County, ${targetState}.`,
    details,
    seoRequirements,
    'Return ONLY valid JSON matching this exact structure:',
    JSON.stringify(LOCATION_PAGE_SCHEMA),
    'For every field with a word range, treat the lower number as a strict minimum.',
    'Content must be hyper-local to the target city — reference specific neighborhoods, landmarks, and community character.',
    'Never use generic filler; write as a real local business owner who knows this city.',
    systemPrompt ? `Industry voice: ${systemPrompt}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

async function callOpenAi(systemPrompt, userPrompt, maxTokens = 4500) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('OpenAI is not configured.', 503, { code: 'OPENAI_NOT_CONFIGURED' });
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: OPENAI_CONTENT_MODEL,
    temperature: LENGTH_CRITICAL_TEMPERATURE,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a professional SEO content writer for local business location landing pages. Write natural, keyword-optimized copy specific to each city. Word counts are HARD REQUIREMENTS. Always return valid JSON only.',
      },
      { role: 'user', content: `${LENGTH_PRIORITY_PREAMBLE}\n\n${userPrompt}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error('OpenAI returned empty location page content');
  }

  return JSON.parse(raw);
}

async function generateLocationPageContent(businessData, location, site, systemPrompt) {
  const { businessName, industry } = businessData;
  const targetCity = location.city;
  const targetState = location.state;

  const shellPrompt = [
    buildLocationPagePrompt(businessData, location, site, systemPrompt),
    'For localIntro, whyLocal, and serviceArea write one short placeholder sentence each — those fields are filled by a separate contract unit.',
  ].join(' ');

  let shell;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      shell = await callOpenAi(systemPrompt, shellPrompt, 2500);
      break;
    } catch (e) {
      lastError = e;
      console.warn(
        JSON.stringify({
          event: 'location_page_generate_retry',
          city: location.city,
          attempt,
          error: e?.message ?? String(e),
          businessName: businessData?.businessName,
        }),
      );
    }
  }

  if (!shell) {
    throw lastError ?? new Error(`Failed to generate location page for ${location.city}`);
  }

  const fields = await generateUnit({
    unitId: 'location.fields',
    systemPrompt:
      systemPrompt ||
      'You write hyper-local SEO copy. Word counts are HARD REQUIREMENTS.',
    userPrompt: [
      `Write localIntro, whyLocal, and serviceArea for ${businessName} (${industry}) targeting ${targetCity}, ${targetState}.`,
      buildLocationSeoRequirements({
        businessName,
        industry,
        city: targetCity,
        state: targetState,
      }),
      'Return ONLY JSON:',
      `{ "localIntro": "${TARGETS.locationLocalIntro.min}-${TARGETS.locationLocalIntro.max} words", "whyLocal": "${TARGETS.locationWhyLocal.min}-${TARGETS.locationWhyLocal.max} words", "serviceArea": "${TARGETS.locationServiceArea.min}-${TARGETS.locationServiceArea.max} words" }`,
      `HARD MINIMUMS: localIntro ${FLOORS.locationLocalIntro}, whyLocal ${FLOORS.locationWhyLocal}, serviceArea ${FLOORS.locationServiceArea}.`,
    ].join(' '),
    maxTokens: 2000,
    temperature: LENGTH_CRITICAL_TEMPERATURE,
  });

  let content = {
    ...shell,
    localIntro: fields.localIntro,
    whyLocal: fields.whyLocal,
    serviceArea: fields.serviceArea,
  };

  content = await ensureSeoMetadata(content, businessData, 'location', systemPrompt, {
    locationCity: location.city,
  });

  content = await attachSeoExtra('location', content, businessData, systemPrompt, {
    locationCity: location.city,
    locationSlug: location.slug || location.city,
    linkTargets: buildSeoExtraLinkTargets({
      pageKind: 'location',
      locationSlug: location.slug || location.city,
    }),
  });

  const { ok, issues } = validateUnit('location.fields', content);
  if (!ok) {
    console.warn(
      JSON.stringify({
        event: 'location_page_contract_warning',
        city: location.city,
        issues,
      }),
    );
  }

  return content;
}

async function generateLocationImageQuery(location, site) {
  const fallback = `${location.city} ${location.state} neighborhood`;
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return fallback;
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content: 'Return only a 3-5 word Pexels photo search query. Nothing else.',
        },
        {
          role: 'user',
          content:
            `Best Pexels photo search query for ${location.city}, ${location.county} County, ${location.state}. ` +
            `Show a recognizable scenic or neighborhood view of this specific city, suitable for a ${site.industry} business location page. ` +
            'Include the city name. Return only 3-5 words.',
        },
      ],
    });

    const query = completion.choices?.[0]?.message?.content?.trim();
    if (!query) {
      return fallback;
    }

    return query.replace(/^["']|["']$/g, '');
  } catch {
    return fallback;
  }
}

export async function generateLocationPageImage(location, site) {
  const query = await generateLocationImageQuery(location, site);

  console.info(
    JSON.stringify({
      event: 'location_image_query',
      city: location.city,
      county: location.county,
      state: location.state,
      query,
    }),
  );

  const imageUrl = await fetchPexelsImageByQuery(query);
  if (!imageUrl) {
    console.warn(
      JSON.stringify({
        event: 'location_image_empty',
        city: location.city,
        query,
      }),
    );
  }

  return imageUrl;
}

/**
 * Uses AI to discover real neighborhoods and suburbs a local business would serve
 * around its primary city. Called automatically when a new site is generated.
 */
async function discoverServiceAreaLocations(city, state, industry) {
  const userPrompt = [
    `List exactly ${DEFAULT_LOCATION_COUNT} real neighborhoods, suburbs, or nearby communities`,
    `that a ${industry} business based in ${city}, ${state} would realistically serve.`,
    'Return ONLY valid JSON:',
    '{ "locations": [{ "city": "real place name", "county": "accurate county name", "state": "two-letter or full state" }] }',
    `Use genuine local place names near ${city}, ${state} — not generic labels like "North Area".`,
    `Each entry must have the correct county for that community.`,
    `Do not repeat ${city} unless it is a distinct neighborhood name separate from the city proper.`,
  ].join(' ');

  try {
    const parsed = await callOpenAi('', userPrompt, 800);
    const locations = Array.isArray(parsed?.locations) ? parsed.locations : [];
    return locations
      .map((loc) => ({
        city: String(loc?.city ?? '').trim(),
        county: String(loc?.county ?? '').trim(),
        state: String(loc?.state ?? state).trim() || state,
      }))
      .filter((loc) => loc.city && loc.county)
      .slice(0, DEFAULT_LOCATION_COUNT);
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: 'discover_service_area_failed',
        city,
        state,
        error: e?.message ?? String(e),
      }),
    );
    return [];
  }
}

/**
 * Generates default neighborhood location pages for a newly created site.
 * Skips silently if the site already has location pages.
 */
export async function generateDefaultLocationPagesForSite(siteId) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) {
    return [];
  }

  const existingCount = await prisma.locationPage.count({ where: { siteId } });
  if (existingCount > 0) {
    return [];
  }

  const locations = await discoverServiceAreaLocations(site.city, site.state, site.industry);
  if (locations.length === 0) {
    console.warn(
      JSON.stringify({
        event: 'default_location_pages_skipped',
        siteId,
        reason: 'no_locations_discovered',
        city: site.city,
      }),
    );
    return [];
  }

  console.info(
    JSON.stringify({
      event: 'default_location_pages_start',
      siteId,
      slug: site.slug,
      count: locations.length,
      cities: locations.map((l) => l.city),
    }),
  );

  return generateLocationPages(siteId, locations);
}

export async function generateLocationPages(siteId, locations) {
  try {
    const site = await prisma.generatedSite.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
    }

    const schema = await getSchemaForIndustry(site.industry);
    const validatedLocations = validateLocations(locations);
    const createdPages = [];

    for (const location of validatedLocations) {
      const pageSlug = slugify(location.city, `${location.county}-county`);

      const existing = await prisma.locationPage.findUnique({
        where: {
          siteId_slug: { siteId, slug: pageSlug },
        },
      });

      if (existing) {
        throw new AppError(
          `Location page already exists for slug "${pageSlug}".`,
          409,
          { code: 'LOCATION_PAGE_EXISTS' },
        );
      }

      const businessData = {
        businessName: site.businessName,
        industry: site.industry,
        city: location.city,
        state: location.state,
        county: location.county,
        phone: site.phone,
        email: site.email,
        description: site.description,
      };

      const generated = await generateLocationPageContent(
        businessData,
        location,
        site,
        schema.systemPrompt,
      );

      const imageUrl = await generateLocationPageImage(location, site);

      const page = await prisma.locationPage.create({
        data: {
          siteId,
          city: location.city,
          county: location.county,
          state: location.state,
          slug: pageSlug,
          content: JSON.stringify(generated),
          imageUrl,
        },
      });

      createdPages.push(page);

      console.info(
        JSON.stringify({
          event: 'location_page_generated',
          siteId,
          pageId: page.id,
          slug: page.slug,
          city: location.city,
          county: location.county,
          localIntroWords: countWords(generated?.localIntro),
          whyLocalWords: countWords(generated?.whyLocal),
          serviceAreaWords: countWords(generated?.serviceArea),
          industrySchema: schema.industry,
        }),
      );
    }

    return createdPages;
  } catch (e) {
    if (e instanceof AppError) {
      throw e;
    }

    console.error(
      JSON.stringify({
        event: 'location_pages_generate_failed',
        siteId,
        error: e?.message ?? String(e),
      }),
    );

    throw new AppError(e?.message ?? 'Failed to generate location pages.', 502, {
      code: 'LOCATION_PAGE_GENERATION_FAILED',
    });
  }
}

/**
 * Discover cities within a zip code radius and generate location pages (additive).
 * Skips cities that already have a page for this site.
 */
export async function generateLocationPagesByRadius(siteId, { zipCode, radiusMiles, maxLocations = 8 }) {
  const zip = String(zipCode ?? '').trim();
  const radius = Number(radiusMiles);
  const limit = Math.min(Math.max(Number(maxLocations) || 8, 1), 20);

  if (!/^\d{5}(-\d{4})?$/.test(zip)) {
    throw new AppError('Field `zipCode` must be a valid US ZIP code.', 400, {
      code: 'INVALID_BODY',
    });
  }
  if (!Number.isFinite(radius) || radius <= 0 || radius > 100) {
    throw new AppError('Field `radiusMiles` must be a number between 1 and 100.', 400, {
      code: 'INVALID_BODY',
    });
  }

  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) {
    throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  }

  const existingPages = await prisma.locationPage.findMany({
    where: { siteId },
    select: { city: true, slug: true },
  });
  const existingCities = new Set(existingPages.map((p) => p.city.toLowerCase()));

  const userPrompt = [
    `Find up to ${limit} real cities or towns within about ${radius} miles of ZIP code ${zip}`,
    `(primary state context: ${site.state}).`,
    `This is for a ${site.industry} business based in ${site.city}, ${site.state}.`,
    'Return ONLY valid JSON:',
    '{ "locations": [{ "city": "real place name", "county": "accurate county name", "state": "two-letter state", "approxMiles": number }] }',
    'Use genuine place names inside the radius. Do not invent places.',
    `Exclude "${site.city}" if it is the same as the business city proper.`,
    'Order by closest first.',
  ].join(' ');

  let discovered = [];
  try {
    const parsed = await callOpenAi(
      'You are a US geography assistant. Return only accurate city/county data as JSON.',
      userPrompt,
      1200,
    );
    discovered = Array.isArray(parsed?.locations) ? parsed.locations : [];
  } catch (e) {
    throw new AppError(e?.message ?? 'Failed to discover cities for this ZIP radius.', 502, {
      code: 'RADIUS_DISCOVERY_FAILED',
    });
  }

  const locations = discovered
    .map((loc) => ({
      city: String(loc?.city ?? '').trim(),
      county: String(loc?.county ?? '').trim(),
      state: String(loc?.state ?? site.state).trim() || site.state,
    }))
    .filter((loc) => loc.city && loc.county)
    .filter((loc) => !existingCities.has(loc.city.toLowerCase()))
    .slice(0, limit);

  if (locations.length === 0) {
    throw new AppError(
      'No new cities found within that radius (or all matches already have pages).',
      404,
      { code: 'NO_LOCATIONS_IN_RADIUS' },
    );
  }

  console.info(
    JSON.stringify({
      event: 'radius_location_pages_start',
      siteId,
      zip,
      radiusMiles: radius,
      count: locations.length,
      cities: locations.map((l) => l.city),
    }),
  );

  // Create pages one-by-one, skipping conflicts instead of failing the whole batch.
  const createdPages = [];
  for (const location of locations) {
    try {
      const pages = await generateLocationPages(siteId, [location]);
      createdPages.push(...pages);
    } catch (e) {
      if (e instanceof AppError && e.statusCode === 409) {
        continue;
      }
      throw e;
    }
  }

  return createdPages;
}
