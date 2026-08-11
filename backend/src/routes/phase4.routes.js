import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import {
  buildSeoRequirements,
  ensureSeoMetadata,
  SEO_META_MAX,
  SEO_META_MIN,
  SEO_TITLE_MAX,
  SEO_TITLE_MIN,
} from '../services/seoMetadata.service.js';
import { createSmtpTransporter } from '../services/email.service.js';
import { scheduleSiteFinalization } from '../services/sitePostProcessing.service.js';
import { revalidateSiteFrontendCache } from '../services/siteRevalidation.service.js';
import { generateLocationPages, generateLocationPagesByRadius } from '../services/locationPage.service.js';
import {
  generatePageContent,
  generateSite,
  generateSiteTheme,
  getGeneratedSiteBySlug,
  listGeneratedSites,
  syncHomeServicesWithServices,
} from '../services/siteGenerator.service.js';
import { normalizeDesignVariant } from '../services/designVariant.service.js';
import {
  createIndustrySchema,
  getAllIndustrySchemas,
  getSchemaForIndustry,
  updateIndustrySchema,
} from '../services/industrySchema.service.js';
import { listContactSubmissions } from '../services/contactSubmission.service.js';
import {
  createTemplate,
  deleteTemplate,
  getAllTemplates,
  updateTemplate,
} from '../services/template.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

import { getOrGenerateServicePage } from '../services/servicePage.service.js';
const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const webhookRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message:
        'Too many site generation requests from this IP. Please try again tomorrow.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

function validateWebhookBody(body) {
  if (!body || typeof body !== 'object') {
    throw new AppError('Request body must be a JSON object.', 400, { code: 'INVALID_BODY' });
  }

  const businessName = String(body.businessName ?? '').trim();
  const industry = String(body.industry ?? '').trim();
  const email = String(body.email ?? '').trim();

  if (!businessName || businessName.length < 2) {
    throw new AppError('Field `businessName` is required and must be at least 2 characters.', 400, {
      code: 'INVALID_BODY',
    });
  }

  if (!industry) {
    throw new AppError('Field `industry` is required.', 400, { code: 'INVALID_BODY' });
  }

  if (!email) {
    throw new AppError('Field `email` is required.', 400, { code: 'INVALID_BODY' });
  }

  if (!EMAIL_REGEX.test(email)) {
    throw new AppError('Field `email` must be a valid email address.', 400, {
      code: 'INVALID_BODY',
    });
  }
}

const HERO_STYLES = new Set(['dark', 'light']);
const FONT_STYLES = new Set(['modern', 'classic', 'friendly']);
const SITE_STATUSES = new Set(['PENDING', 'ACTIVE', 'INACTIVE']);
const GHL_VERSION = '2021-07-28';

async function sendContactNotificationEmail(site, submission) {
  const subject = `New contact from ${site.businessName} website`;
  const submittedAt = submission.createdAt.toISOString();
  const text = [
    'A new contact form submission was received.',
    '',
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Phone: ${submission.phone ?? '—'}`,
    `Message: ${submission.message}`,
    `Site slug: ${site.slug}`,
    `Submitted at: ${submittedAt}`,
  ].join('\n');

  if (env.MOCK_MODE) {
    console.info(
      JSON.stringify({
        event: 'contact_notification_mock',
        siteSlug: site.slug,
        submissionId: submission.id,
        subject,
      }),
    );
    return { mock: true };
  }

  if (
    !env.SMTP_HOST ||
    !env.SMTP_USER ||
    !env.SMTP_PASS ||
    !env.ALERT_EMAIL_FROM ||
    !env.ALERT_EMAIL_TO
  ) {
    console.warn(
      JSON.stringify({
        event: 'contact_notification_skipped',
        reason: 'SMTP or alert email env not configured',
        siteSlug: site.slug,
        submissionId: submission.id,
      }),
    );
    return { skipped: true };
  }

  const transporter = createSmtpTransporter();
  const info = await transporter.sendMail({
    from: env.ALERT_EMAIL_FROM,
    to: env.ALERT_EMAIL_TO,
    subject,
    text,
  });

  console.info(
    JSON.stringify({
      event: 'contact_notification_sent',
      siteSlug: site.slug,
      submissionId: submission.id,
      messageId: info.messageId,
    }),
  );

  return info;
}

async function resolveGhlLocationForSite(site) {
  const locations = await prisma.location.findMany({
    where: {
      status: 'ACTIVE',
      ghlApiKey: { not: null },
    },
    include: {
      business: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const withKey = locations.filter((location) => location.ghlApiKey?.trim());
  if (withKey.length === 0) {
    return null;
  }

  const normalizedIndustry = String(site.industry ?? '')
    .trim()
    .toLowerCase();

  const industryMatch = withKey.find((location) => {
    const businessName = String(location.business?.name ?? '').toLowerCase();
    return normalizedIndustry && businessName.includes(normalizedIndustry);
  });

  return industryMatch ?? withKey[0];
}

async function createGhlContactFromSubmission(site, submission) {
  const location = await resolveGhlLocationForSite(site);
  if (!location?.ghlApiKey?.trim()) {
    console.warn(
      JSON.stringify({
        event: 'ghl_contact_skipped',
        reason: 'No active location with ghlApiKey found',
        siteSlug: site.slug,
      }),
    );
    return { skipped: true };
  }

  if (env.MOCK_MODE) {
    console.info(
      JSON.stringify({
        event: 'ghl_contact_mock',
        siteSlug: site.slug,
        ghlLocationId: location.ghlLocationId,
        email: submission.email,
      }),
    );
    return { mock: true };
  }

  try {
    const response = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${location.ghlApiKey.trim()}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Version: GHL_VERSION,
      },
      body: JSON.stringify({
        locationId: location.ghlLocationId,
        firstName: submission.name,
        email: submission.email,
        phone: submission.phone ?? undefined,
        source: 'Website Contact Form',
        tags: ['website-lead', site.industry],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GHL contacts API failed: ${response.status} ${body}`);
    }

    return { success: true };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'ghl_contact_failed',
        siteSlug: site.slug,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return { success: false };
  }
}

function slugifySite(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeHexColor(value) {
  const v = String(value ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v.toUpperCase()}`;
  return null;
}

async function getGeneratedSiteById(id) {
  const site = await prisma.generatedSite.findUnique({
    where: { id },
    include: { template: true },
  });

  if (!site) {
    throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  }

  return site;
}

async function ensureUniqueSiteSlugForUpdate(baseSlug, excludeId) {
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await prisma.generatedSite.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) {
      return candidate;
    }
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function regenerateSiteContent(site) {
  const businessData = {
    businessName: site.businessName,
    industry: site.industry,
    city: site.city,
    state: site.state,
    phone: site.phone,
    email: site.email,
    description: site.description,
  };

  const schema = await getSchemaForIndustry(site.industry);

  const [homeResult, aboutResult, servicesResult, contactResult, blogResult, theme] =
    await Promise.all([
      generatePageContent(
        businessData,
        schema.homePageSchema,
        schema.systemPrompt,
        'home',
      ),
      generatePageContent(
        businessData,
        schema.aboutPageSchema,
        schema.systemPrompt,
        'about',
      ),
      generatePageContent(
        businessData,
        schema.servicesPageSchema,
        schema.systemPrompt,
        'services',
      ),
      generatePageContent(
        businessData,
        schema.contactPageSchema,
        schema.systemPrompt,
        'contact',
      ),
      generatePageContent(
        businessData,
        schema.blogPageSchema,
        schema.systemPrompt,
        'blog',
      ),
      generateSiteTheme(businessData.businessName, businessData.industry, businessData.city),
    ]);

  const syncedHome = syncHomeServicesWithServices(homeResult, servicesResult);

  return {
    homeContent: JSON.stringify(syncedHome),
    aboutContent: JSON.stringify(aboutResult),
    servicesContent: JSON.stringify(servicesResult),
    contactContent: JSON.stringify(contactResult),
    blogContent: JSON.stringify(blogResult),
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    heroStyle: theme.heroStyle,
    fontStyle: theme.fontStyle,
  };
}

function buildSiteUpdateData(body) {
  const updates = {};

  if (body.businessName !== undefined) {
    const businessName = String(body.businessName ?? '').trim();
    if (!businessName) {
      throw new AppError('Field `businessName` cannot be empty.', 400, { code: 'INVALID_BODY' });
    }
    updates.businessName = businessName;
  }

  if (body.industry !== undefined) {
    const industry = String(body.industry ?? '').trim();
    if (!industry) {
      throw new AppError('Field `industry` cannot be empty.', 400, { code: 'INVALID_BODY' });
    }
    updates.industry = industry;
  }

  if (body.city !== undefined) {
    const city = String(body.city ?? '').trim();
    if (!city) {
      throw new AppError('Field `city` cannot be empty.', 400, { code: 'INVALID_BODY' });
    }
    updates.city = city;
  }

  if (body.phone !== undefined) {
    updates.phone =
      body.phone != null && body.phone !== '' ? String(body.phone).trim() : null;
  }

  if (body.email !== undefined) {
    updates.email =
      body.email != null && body.email !== '' ? String(body.email).trim() : null;
  }

  if (body.description !== undefined) {
    updates.description =
      body.description != null && body.description !== ''
        ? String(body.description).trim()
        : null;
  }

  if (body.state !== undefined) {
    const state = String(body.state ?? '').trim();
    if (!state) {
      throw new AppError('Field `state` cannot be empty.', 400, { code: 'INVALID_BODY' });
    }
    updates.state = state;
  }

  if (body.address !== undefined) {
    updates.address =
      body.address != null && body.address !== '' ? String(body.address).trim() : null;
  }

  if (body.facebookUrl !== undefined) {
    updates.facebookUrl =
      body.facebookUrl != null && body.facebookUrl !== ''
        ? String(body.facebookUrl).trim()
        : null;
  }

  if (body.instagramUrl !== undefined) {
    updates.instagramUrl =
      body.instagramUrl != null && body.instagramUrl !== ''
        ? String(body.instagramUrl).trim()
        : null;
  }

  if (body.websiteUrl !== undefined) {
    updates.websiteUrl =
      body.websiteUrl != null && body.websiteUrl !== ''
        ? String(body.websiteUrl).trim()
        : null;
  }

  if (body.logoUrl !== undefined) {
    updates.logoUrl =
      body.logoUrl != null && body.logoUrl !== '' ? String(body.logoUrl).trim() : null;
  }

  if (body.primaryColor !== undefined) {
    const primaryColor = normalizeHexColor(body.primaryColor);
    if (!primaryColor) {
      throw new AppError('Invalid `primaryColor` hex value.', 400, { code: 'INVALID_BODY' });
    }
    updates.primaryColor = primaryColor;
  }

  if (body.secondaryColor !== undefined) {
    const secondaryColor = normalizeHexColor(body.secondaryColor);
    if (!secondaryColor) {
      throw new AppError('Invalid `secondaryColor` hex value.', 400, { code: 'INVALID_BODY' });
    }
    updates.secondaryColor = secondaryColor;
  }

  if (body.accentColor !== undefined) {
    const accentColor = normalizeHexColor(body.accentColor);
    if (!accentColor) {
      throw new AppError('Invalid `accentColor` hex value.', 400, { code: 'INVALID_BODY' });
    }
    updates.accentColor = accentColor;
  }

  if (body.heroStyle !== undefined) {
    const heroStyle = String(body.heroStyle ?? '').trim().toLowerCase();
    if (!HERO_STYLES.has(heroStyle)) {
      throw new AppError('Invalid `heroStyle`. Use dark or light.', 400, { code: 'INVALID_BODY' });
    }
    updates.heroStyle = heroStyle;
  }

  if (body.fontStyle !== undefined) {
    const fontStyle = String(body.fontStyle ?? '').trim().toLowerCase();
    if (!FONT_STYLES.has(fontStyle)) {
      throw new AppError(
        'Invalid `fontStyle`. Use modern, classic, or friendly.',
        400,
        { code: 'INVALID_BODY' },
      );
    }
    updates.fontStyle = fontStyle;
  }

  if (body.designVariant !== undefined) {
    const designVariant = normalizeDesignVariant(body.designVariant);
    if (!designVariant) {
      throw new AppError('Invalid `designVariant`. Use an integer from 1 to 50.', 400, {
        code: 'INVALID_BODY',
      });
    }
    updates.designVariant = designVariant;
  }

  if (body.yearsInBusiness !== undefined) {
    updates.yearsInBusiness =
      body.yearsInBusiness != null && body.yearsInBusiness !== ''
        ? String(body.yearsInBusiness).trim()
        : null;
  }

  if (body.customersServed !== undefined) {
    updates.customersServed =
      body.customersServed != null && body.customersServed !== ''
        ? String(body.customersServed).trim()
        : null;
  }

  if (body.projectsCompleted !== undefined) {
    updates.projectsCompleted =
      body.projectsCompleted != null && body.projectsCompleted !== ''
        ? String(body.projectsCompleted).trim()
        : null;
  }

  if (body.status !== undefined) {
    const status = String(body.status ?? '').trim().toUpperCase();
    if (!SITE_STATUSES.has(status)) {
      throw new AppError('Invalid `status`. Use PENDING, ACTIVE, or INACTIVE.', 400, {
        code: 'INVALID_BODY',
      });
    }
    updates.status = status;
  }

  return updates;
}

function shouldRegenerateContent(existing, updates) {
  if (updates.businessName !== undefined && updates.businessName !== existing.businessName) {
    return true;
  }
  if (updates.industry !== undefined && updates.industry !== existing.industry) {
    return true;
  }
  if (updates.city !== undefined && updates.city !== existing.city) {
    return true;
  }
  return false;
}

function serializeSiteWithTheme(site) {
  return {
    ...site,
    theme: {
      primaryColor: site.primaryColor,
      secondaryColor: site.secondaryColor,
      accentColor: site.accentColor,
      heroStyle: site.heroStyle,
      fontStyle: site.fontStyle,
    },
  };
}

async function generateOpenAIQuery(businessName, industry, purpose, serviceTitle = null) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    if (serviceTitle) {
      return `${serviceTitle} ${industry} professional close up`;
    }
    return `${industry} professional`;
  }

  try {
    const userContent = serviceTitle
      ? `Best Pexels photo search query for "${serviceTitle}" service at ${businessName}, a ${industry} business. Use the exact service name in the query. Return only a 3-5 word search query, nothing else.`
      : `Best Pexels photo search query for ${purpose} at ${businessName}, a ${industry} business. Return only a 3-5 word search query, nothing else.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 30,
        messages: [
          {
            role: 'system',
            content: 'Return only a 3-5 word Pexels photo search query. Nothing else.',
          },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status}`);
    }

    const data = await res.json();
    const query = data.choices?.[0]?.message?.content?.trim();
    if (!query) {
      throw new Error('OpenAI returned empty query');
    }

    return query.replace(/^["']|["']$/g, '');
  } catch {
    if (serviceTitle) {
      return `${serviceTitle} ${industry} professional close up`;
    }
    return `${industry} professional`;
  }
}

function buildSectionQuery(site, sectionKey, services) {
  const { businessName, industry } = site;

  if (sectionKey === 'hero') {
    return `hero banner background for ${businessName} ${industry} business exterior`;
  }
  if (sectionKey === 'about') {
    return `team at work inside ${industry} business office`;
  }
  if (sectionKey.startsWith('service_')) {
    const index = Number.parseInt(sectionKey.replace('service_', ''), 10);
    const title = services[index]?.title || `${industry} service`;
    return `${title} technician working close up`;
  }
  if (sectionKey === 'blog' || sectionKey.startsWith('blog_')) {
    const index = sectionKey === 'blog' ? 0 : Number.parseInt(sectionKey.replace('blog_', ''), 10);
    const blogQueries = [
      `${industry} professional tips advice`,
      `${industry} maintenance service`,
      `${industry} customer satisfaction`,
    ];
    return blogQueries[index] ?? `${industry} professional work environment`;
  }

  return `${industry} professional`;
}

async function fetchPexelsImage(query) {
  const apiKey = env.PEXELS_API_KEY?.trim();
  if (!apiKey || !String(query ?? '').trim()) {
    return null;
  }

  try {
    const page = Math.floor(Math.random() * 5) + 1;
    const params = new URLSearchParams({
      query: String(query).trim(),
      per_page: '15',
      orientation: 'landscape',
      page: String(page),
    });

    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      throw new Error(`Pexels request failed: ${res.status}`);
    }

    const data = await res.json();
    const photos = data.photos;
    if (!Array.isArray(photos) || photos.length === 0) {
      return null;
    }

    const photo = photos[Math.floor(Math.random() * photos.length)];
    return photo?.src?.large2x ?? null;
  } catch {
    return null;
  }
}

function parseJsonSafe(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveServicesList(site) {
  const homeContent = parseJsonSafe(site.homeContent);
  const servicesContent = parseJsonSafe(site.servicesContent);
  const homeServices = Array.isArray(homeContent.services) ? homeContent.services : [];
  const pageServices = Array.isArray(servicesContent.services) ? servicesContent.services : [];
  const count = Math.max(homeServices.length, pageServices.length);

  return Array.from({ length: count }, (_, index) => {
    const pageTitle =
      typeof pageServices[index]?.title === 'string' ? pageServices[index].title.trim() : '';
    const homeTitle =
      typeof homeServices[index]?.title === 'string' ? homeServices[index].title.trim() : '';
    return {
      title: pageTitle || homeTitle || `${site.industry} service`,
    };
  });
}

function resolveBlogCount(site) {
  const posts = parseJsonSafe(site.blogContent).posts ?? [];
  return Math.max(posts.length, 3);
}

function getBlogKey(index) {
  return index === 0 ? 'blog' : `blog_${index}`;
}

async function buildSiteImages(site) {
  const services = resolveServicesList(site);
  const serviceNames = services.map((s) => s.title).join(', ');

  console.log('Generating images for:', {
    businessName: site.businessName,
    industry: site.industry,
    services: serviceNames,
  });

  const serviceKeys = services.map((_, index) => `service_${index}`);
  const blogCount = resolveBlogCount(site);
  const blogKeys = Array.from({ length: blogCount }, (_, index) => getBlogKey(index));
  const allKeys = ['hero', 'about', ...serviceKeys, ...blogKeys];

  const results = await Promise.all(
    allKeys.map(async (key) => {
      let query;

      if (key.startsWith('service_')) {
        const index = Number.parseInt(key.replace('service_', ''), 10);
        const serviceTitle = services[index]?.title;
        query = await generateOpenAIQuery(
          site.businessName,
          site.industry,
          null,
          serviceTitle,
        );
        console.log(`Image query for ${key} (${serviceTitle}):`, query);
      } else {
        query = buildSectionQuery(site, key, services);
      }

      const url = await fetchPexelsImage(query);
      return [key, url];
    }),
  );

  const imageMap = Object.fromEntries(results);

  return {
    hero: imageMap.hero ?? null,
    about: imageMap.about ?? null,
    services: serviceKeys.map((key) => imageMap[key] ?? null),
    blog: blogKeys.map((key) => imageMap[key] ?? null),
  };
}

function findServiceBySlug(site, serviceSlug) {
  const servicesContent = parseJsonSafe(site.servicesContent);
  const services = Array.isArray(servicesContent.services) ? servicesContent.services : [];

  return services.find((service) => {
    const title = typeof service?.title === 'string' ? service.title : '';
    return slugifySite(title) === serviceSlug;
  });
}

const servicePageRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests for service pages from this IP. Please try again shortly.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});



router.get(
  '/sites/:slug/services/:serviceSlug',
  servicePageRateLimiter,
  asyncHandler(async (req, res) => {
    const site = await prisma.generatedSite.findUnique({
      where: { slug: req.params.slug },
    });

    if (!site) {
      throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
    }

    const { serviceSlug } = req.params;

    const existingPage = await prisma.servicePage.findUnique({
      where: { siteId_serviceSlug: { siteId: site.id, serviceSlug } },
    });

    if (existingPage) {
      return res.json({
        success: true,
        data: { content: parseJsonSafe(existingPage.content) },
        requestId: req.requestId,
      });
    }

    const service = findServiceBySlug(site, serviceSlug);
    if (!service) {
      throw new AppError('Service not found for this site.', 404, { code: 'SERVICE_NOT_FOUND' });
    }

    let servicePage;
    try {
      servicePage = await getOrGenerateServicePage(site, serviceSlug, service);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'service_page_generate_failed',
          siteSlug: site.slug,
          serviceSlug,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to generate service page content.', 502, {
        code: 'SERVICE_PAGE_GENERATION_FAILED',
      });
    }

    return res.json({
      success: true,
      data: { content: parseJsonSafe(servicePage.content) },
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/contacts',
  asyncHandler(async (req, res) => {
    const { contacts, total, pagination } = await listContactSubmissions(req.query);

    return res.json({
      success: true,
      data: { contacts, total, pagination },
      requestId: req.requestId,
    });
  }),
);

router.delete(
  '/contacts/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.contactSubmission.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new AppError('Contact submission not found.', 404, { code: 'CONTACT_NOT_FOUND' });
    }

    await prisma.contactSubmission.delete({ where: { id: req.params.id } });

    return res.json({
      success: true,
      data: { message: 'Contact submission deleted.', id: req.params.id },
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/industry-schemas',
  asyncHandler(async (req, res) => {
    const { schemas, pagination } = await getAllIndustrySchemas(req.query);
    return res.json({
      success: true,
      data: { schemas, pagination },
      requestId: req.requestId,
    });
  }),
);

router.post(
  '/industry-schemas',
  asyncHandler(async (req, res) => {
    const schema = await createIndustrySchema(req.body ?? {});
    return res.status(201).json({
      success: true,
      data: { schema },
      requestId: req.requestId,
    });
  }),
);

router.put(
  '/industry-schemas/:id',
  asyncHandler(async (req, res) => {
    const schema = await updateIndustrySchema(req.params.id, req.body ?? {});
    return res.json({
      success: true,
      data: { schema },
      requestId: req.requestId,
    });
  }),
);

router.delete(
  '/industry-schemas/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.industrySchema.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new AppError('Industry schema not found.', 404, { code: 'INDUSTRY_SCHEMA_NOT_FOUND' });
    }

    const sitesUsingIndustry = await prisma.generatedSite.count({
      where: {
        industry: { equals: existing.industry, mode: 'insensitive' },
      },
    });

    if (sitesUsingIndustry > 0) {
      throw new AppError(
        'Cannot delete industry schema while sites are using this industry.',
        409,
        { code: 'INDUSTRY_SCHEMA_IN_USE' },
      );
    }

    const schema = await prisma.industrySchema.delete({
      where: { id: req.params.id },
    });

    return res.json({
      success: true,
      data: { schema },
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/industry-schemas/:industry',
  asyncHandler(async (req, res) => {
    const schema = await getSchemaForIndustry(req.params.industry);
    return res.json({
      success: true,
      data: { schema },
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const { templates, pagination } = await getAllTemplates(req.query);
    return res.json({
      success: true,
      data: { templates, pagination },
      requestId: req.requestId,
    });
  }),
);

router.post(
  '/templates',
  asyncHandler(async (req, res) => {
    const template = await createTemplate(req.body ?? {});
    return res.status(201).json({
      success: true,
      data: { template },
      requestId: req.requestId,
    });
  }),
);

router.put(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const template = await updateTemplate(req.params.id, req.body ?? {});
    return res.json({
      success: true,
      data: { template },
      requestId: req.requestId,
    });
  }),
);

router.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const template = await deleteTemplate(req.params.id);
    return res.json({
      success: true,
      data: { template },
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/sites',
  asyncHandler(async (req, res) => {
    const { sites, pagination } = await listGeneratedSites(req.query);
    return res.json({
      success: true,
      data: {
        sites: sites.map(serializeSiteWithTheme),
        pagination,
      },
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/sites/:slug/contacts',
  asyncHandler(async (req, res) => {
    const site = await getGeneratedSiteBySlug(req.params.slug);
    const contacts = await prisma.contactSubmission.findMany({
      where: { siteId: site.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      success: true,
      data: { contacts, total: contacts.length },
      requestId: req.requestId,
    });
  }),
);

router.post(
  '/sites/:slug/contact',
  asyncHandler(async (req, res) => {
    const site = await prisma.generatedSite.findUnique({
      where: { slug: req.params.slug },
    });

    if (!site) {
      throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
    }

    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim();
    const phone =
      req.body?.phone != null && req.body.phone !== '' ? String(req.body.phone).trim() : null;
    const message = String(req.body?.message ?? '').trim();

    if (!name) {
      throw new AppError('Field `name` is required.', 400, { code: 'INVALID_BODY' });
    }
    if (!email) {
      throw new AppError('Field `email` is required.', 400, { code: 'INVALID_BODY' });
    }
    if (!message) {
      throw new AppError('Field `message` is required.', 400, { code: 'INVALID_BODY' });
    }

    const submission = await prisma.contactSubmission.create({
      data: {
        siteId: site.id,
        name,
        email,
        phone,
        message,
      },
    });

    try {
      await sendContactNotificationEmail(site, submission);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'contact_notification_failed',
          siteSlug: site.slug,
          submissionId: submission.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    await createGhlContactFromSubmission(site, submission);

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/sites/:slug/location-pages',
  asyncHandler(async (req, res) => {
    const site = await getGeneratedSiteBySlug(req.params.slug);
    return res.json({
      success: true,
      data: { pages: site.locationPages ?? [] },
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/sites/:slug/images',
  asyncHandler(async (req, res) => {
    const site = await getGeneratedSiteBySlug(req.params.slug);
    const images = await buildSiteImages(site);

    return res.json({
      success: true,
      data: { images },
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/sites/:slug',
  asyncHandler(async (req, res) => {
    const site = await getGeneratedSiteBySlug(req.params.slug);
    return res.json({
      success: true,
      data: { site: serializeSiteWithTheme(site) },
      requestId: req.requestId,
    });
  }),
);

router.post(
  '/webhook',
  webhookRateLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    validateWebhookBody(body);

    const businessName = String(body.businessName ?? '').trim();
    const city = String(body.city ?? '').trim();
    const baseSlug = slugifySite(businessName, city);

    if (baseSlug) {
      const existing = await prisma.generatedSite.findUnique({
        where: { slug: baseSlug },
        include: { template: true },
      });

      if (existing) {
        return res.json({
          success: true,
          data: {
            slug: existing.slug,
            site: serializeSiteWithTheme(existing),
            existing: true,
          },
          requestId: req.requestId,
        });
      }
    }

    const site = await generateSite(body);

    scheduleSiteFinalization(site.id);

    return res.status(201).json({
      success: true,
      data: { slug: site.slug, site },
      requestId: req.requestId,
    });
  }),
);

router.patch(
  '/sites/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await getGeneratedSiteById(id);
    const updates = buildSiteUpdateData(req.body ?? {});

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid fields to update.', 400, { code: 'INVALID_BODY' });
    }

    const merged = { ...existing, ...updates };
    let data = { ...updates };

    if (shouldRegenerateContent(existing, updates)) {
      const regenerated = await regenerateSiteContent(merged);
      data = { ...data, ...regenerated };

      const baseSlug = slugifySite(merged.businessName, merged.city);
      if (baseSlug !== existing.slug) {
        data.slug = await ensureUniqueSiteSlugForUpdate(baseSlug, id);
      }
    }

    const site = await prisma.generatedSite.update({
      where: { id },
      data,
      include: { template: true },
    });

    await revalidateSiteFrontendCache(site.slug);

    return res.json({
      success: true,
      data: { site: serializeSiteWithTheme(site) },
      requestId: req.requestId,
    });
  }),
);

router.post(
  '/sites/:id/regenerate',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await getGeneratedSiteById(id);
    const regenerated = await regenerateSiteContent(existing);

    const site = await prisma.generatedSite.update({
      where: { id },
      data: regenerated,
      include: { template: true },
    });

    await revalidateSiteFrontendCache(site.slug);

    return res.json({
      success: true,
      data: { site: serializeSiteWithTheme(site) },
      requestId: req.requestId,
    });
  }),
);

router.post(
  '/sites/:siteId/location-pages',
  asyncHandler(async (req, res) => {
    const locations = req.body?.locations;
    const pages = await generateLocationPages(req.params.siteId, locations);
    return res.status(201).json({
      success: true,
      data: { pages },
      requestId: req.requestId,
    });
  }),
);

router.post(
  '/sites/:siteId/location-pages/by-radius',
  asyncHandler(async (req, res) => {
    const zipCode = String(req.body?.zipCode ?? req.body?.zip ?? '').trim();
    const radiusMiles = Number(req.body?.radiusMiles ?? req.body?.radius ?? 0);
    const maxLocations = req.body?.maxLocations != null ? Number(req.body.maxLocations) : undefined;

    const pages = await generateLocationPagesByRadius(req.params.siteId, {
      zipCode,
      radiusMiles,
      maxLocations,
    });

    return res.status(201).json({
      success: true,
      data: { pages },
      requestId: req.requestId,
    });
  }),
);

function parseSiteJsonContent(value, label) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new AppError(`Invalid ${label} JSON on site.`, 500, { code: 'INVALID_SITE_CONTENT' });
  }
}

router.post(
  '/sites/:id/services',
  asyncHandler(async (req, res) => {
    const existing = await getGeneratedSiteById(req.params.id);

    const title = String(req.body?.title ?? '').trim();
    const shortDescription = String(req.body?.shortDescription ?? '').trim();
    const fullDescription = String(req.body?.fullDescription ?? '').trim();
    const icon = String(req.body?.icon ?? '').trim();

    if (!title) {
      throw new AppError('Field `title` is required.', 400, { code: 'INVALID_BODY' });
    }
    if (!shortDescription) {
      throw new AppError('Field `shortDescription` is required.', 400, { code: 'INVALID_BODY' });
    }
    if (!fullDescription) {
      throw new AppError('Field `fullDescription` is required.', 400, { code: 'INVALID_BODY' });
    }
    if (!icon) {
      throw new AppError('Field `icon` is required.', 400, { code: 'INVALID_BODY' });
    }

    const servicesContent = parseSiteJsonContent(existing.servicesContent, 'servicesContent');
    const homeContent = parseSiteJsonContent(existing.homeContent, 'homeContent');

    const services = Array.isArray(servicesContent.services) ? [...servicesContent.services] : [];
    const homeServices = Array.isArray(homeContent.services) ? [...homeContent.services] : [];

    services.push({
      title,
      shortDescription,
      fullDescription,
      icon,
    });
    homeServices.push({
      title,
      description: shortDescription,
      icon,
    });

    const site = await prisma.generatedSite.update({
      where: { id: existing.id },
      data: {
        servicesContent: JSON.stringify({ ...servicesContent, services }),
        homeContent: JSON.stringify({ ...homeContent, services: homeServices }),
      },
      include: { template: true },
    });

    return res.status(201).json({
      success: true,
      data: { site: serializeSiteWithTheme(site) },
      requestId: req.requestId,
    });
  }),
);

router.delete(
  '/sites/:id/services/:serviceIndex',
  asyncHandler(async (req, res) => {
    const existing = await getGeneratedSiteById(req.params.id);
    const serviceIndex = Number.parseInt(String(req.params.serviceIndex), 10);

    if (!Number.isInteger(serviceIndex) || serviceIndex < 0) {
      throw new AppError('Invalid service index.', 400, { code: 'INVALID_SERVICE_INDEX' });
    }

    const servicesContent = parseSiteJsonContent(existing.servicesContent, 'servicesContent');
    const homeContent = parseSiteJsonContent(existing.homeContent, 'homeContent');

    const services = Array.isArray(servicesContent.services) ? [...servicesContent.services] : [];
    const homeServices = Array.isArray(homeContent.services) ? [...homeContent.services] : [];

    if (serviceIndex >= services.length) {
      throw new AppError('Service not found at the given index.', 404, {
        code: 'SERVICE_NOT_FOUND',
      });
    }

    services.splice(serviceIndex, 1);
    if (serviceIndex < homeServices.length) {
      homeServices.splice(serviceIndex, 1);
    }

    const site = await prisma.generatedSite.update({
      where: { id: existing.id },
      data: {
        servicesContent: JSON.stringify({ ...servicesContent, services }),
        homeContent: JSON.stringify({ ...homeContent, services: homeServices }),
      },
      include: { template: true },
    });

    return res.json({
      success: true,
      data: { site: serializeSiteWithTheme(site) },
      requestId: req.requestId,
    });
  }),
);

router.delete(
  '/sites/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.generatedSite.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
    }

    await prisma.locationPage.deleteMany({ where: { siteId: id } });
    await prisma.generatedSite.delete({ where: { id } });

    return res.json({
      success: true,
      data: {
        message: 'Site and all location pages deleted successfully.',
        siteId: id,
      },
      requestId: req.requestId,
    });
  }),
);

export default router;
