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
import {
  generateLocationPages,
  generateLocationPagesByRadius,
  previewRadiusTowns,
} from '../services/locationPage.service.js';
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
import { deliverLeadToGhl } from '../services/siteLeads.service.js';
import {
  deleteKeywordPage,
  getKeywordJob,
  getPublishedKeywordPage,
  listKeywordPages,
  listPublishedKeywordPages,
  setKeywordPagePublished,
  startKeywordGeneration,
} from '../services/keywordPage.service.js';
import {
  createTemplate,
  deleteTemplate,
  getAllTemplates,
  updateTemplate,
} from '../services/template.service.js';
import {
  createBlogPost,
  deleteBlogPost,
  getBlogSettings,
  getPublicBlog,
  getPublicBlogPost,
  importLegacyPosts,
  listBlogPosts,
  updateBlogPost,
  updateBlogSettings,
} from '../services/blog.service.js';
import { uploadSiteImage } from '../services/media.service.js';
import { changeSiteSlug, getRedirectMap, listSiteRedirects } from '../services/siteRedirects.service.js';
import { getSiteDomain, listCustomDomains, setSiteDomain, verifySiteDomain } from '../services/siteDomains.service.js';
import { getStoredSiteImages, listImageSlots, searchStockPhotos, setSiteImage } from '../services/siteImages.service.js';
import {
  getPageEditor,
  keepServicesOnRegeneration,
  revertPageEdit,
  savePageEdits,
  withRecordedEdits,
} from '../services/siteContentEdits.service.js';
import { parseImageMultipart } from '../middleware/mediaUpload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

import { getOrGenerateServicePage } from '../services/servicePage.service.js';
import {
  generateServiceContent,
  normalizeServiceTitle,
  serviceSlugOf,
  validateServiceTitle,
} from '../services/serviceGeneration.service.js';
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

/** Purges the renderer cache for a site known only by id (never throws). */
async function revalidateSiteById(siteId) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId }, select: { slug: true } });
  if (site?.slug) await revalidateSiteFrontendCache(site.slug);
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

  if (body.searchIndexable !== undefined) {
    if (typeof body.searchIndexable !== 'boolean') {
      throw new AppError('Field `searchIndexable` must be true or false.', 400, {
        code: 'INVALID_BODY',
      });
    }
    updates.searchIndexable = body.searchIndexable;
  }

  if (body.leadLocationId !== undefined) {
    // null/"" = unmap (leads are held). Existence is checked in the route.
    updates.leadLocationId =
      body.leadLocationId == null || body.leadLocationId === '' ? null : String(body.leadLocationId).trim();
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

function parseJsonSafe(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
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

    // The site's current service list decides: a removed service is 404 even
    // if its generated page is still stored.
    const service = findServiceBySlug(site, serviceSlug);
    if (!service) {
      throw new AppError('Service not found for this site.', 404, { code: 'SERVICE_NOT_FOUND' });
    }

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

/**
 * Re-sends a held or failed lead once its site has a GHL location mapped.
 * Manual only (dashboard button); leads are never retried automatically.
 */
router.post(
  '/contacts/:id/send-to-ghl',
  asyncHandler(async (req, res) => {
    const submission = await prisma.contactSubmission.findUnique({
      where: { id: req.params.id },
      include: { site: true },
    });
    if (!submission) {
      throw new AppError('Contact submission not found.', 404, { code: 'CONTACT_NOT_FOUND' });
    }
    if (submission.ghlStatus === 'SENT') {
      throw new AppError('This lead was already sent to GHL.', 409, { code: 'LEAD_ALREADY_SENT' });
    }
    const result = await deliverLeadToGhl(submission.site, submission);
    return res.json({ success: true, data: result, requestId: req.requestId });
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

/**
 * Slugs of ACTIVE sites that may be indexed by search engines. The renderer's
 * middleware uses this to set X-Robots-Tag; every other site is noindex.
 */
router.get(
  '/indexable-sites',
  asyncHandler(async (req, res) => {
    const sites = await prisma.generatedSite.findMany({
      where: { status: 'ACTIVE', searchIndexable: true },
      select: { slug: true },
    });
    return res.json({
      success: true,
      data: { slugs: sites.map((s) => s.slug) },
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

/** Public contact form: per-IP limit to stop floods and abuse. */
const contactRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many messages. Please try again later.' },
  },
});

const CONTACT_LIMITS = { name: 120, email: 200, phone: 40, message: 5000 };

router.post(
  '/sites/:slug/contact',
  contactRateLimiter,
  asyncHandler(async (req, res) => {
    // Honeypot: a hidden "website" field real visitors never fill. Bots that
    // fill it get a normal-looking success; nothing is stored or sent.
    if (String(req.body?.website ?? '').trim()) {
      console.warn(JSON.stringify({ event: 'contact_honeypot_triggered', siteSlug: req.params.slug }));
      return res
        .status(201)
        .json({ success: true, message: 'Message sent successfully', requestId: req.requestId });
    }

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
    if (!EMAIL_REGEX.test(email)) {
      throw new AppError('Field `email` must be a valid email address.', 400, { code: 'INVALID_BODY' });
    }
    const lengths = { name, email, phone: phone ?? '', message };
    for (const [field, max] of Object.entries(CONTACT_LIMITS)) {
      if (lengths[field].length > max) {
        throw new AppError(`Field \`${field}\` must be at most ${max} characters.`, 400, {
          code: 'INVALID_BODY',
        });
      }
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

    // Only the GHL location mapped to this site; unmapped sites hold the lead.
    await deliverLeadToGhl(site, submission);

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
    const images = await getStoredSiteImages(site);

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

/** Creates (or returns the existing) site for an intake payload. */
async function handleSiteGenerationRequest(req, res) {
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
}

/** Public intake for the order form (caller being confirmed; see phase4Auth). */
router.post('/webhook', webhookRateLimiter, asyncHandler(handleSiteGenerationRequest));

/**
 * Dashboard "Form Submission (Test)": same generation, admin key required
 * (any /phase4 route not listed as public/renderer/webhook is admin-only).
 */
router.post('/admin/generate-site', asyncHandler(handleSiteGenerationRequest));

router.patch(
  '/sites/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await getGeneratedSiteById(id);
    const updates = buildSiteUpdateData(req.body ?? {});

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid fields to update.', 400, { code: 'INVALID_BODY' });
    }

    if (updates.leadLocationId) {
      const location = await prisma.location.findUnique({
        where: { id: updates.leadLocationId },
        select: { id: true },
      });
      if (!location) {
        throw new AppError('Unknown lead location.', 400, { code: 'INVALID_LEAD_LOCATION' });
      }
    }

    const merged = { ...existing, ...updates };
    let data = { ...updates };

    // The URL only changes through POST /sites/:id/change-url (which adds the 301).
    if (req.body?.changeSlug === true) {
      throw new AppError('Use POST /sites/:id/change-url to change a site address.', 400, {
        code: 'USE_CHANGE_URL',
      });
    }

    // Regeneration is explicit: editing name/industry/city only saves the
    // fields unless the caller also sends regenerateContent: true. The URL
    // (slug) never changes as a side effect.
    if (req.body?.regenerateContent === true && shouldRegenerateContent(existing, updates)) {
      // Services stay (same industry) and hand edits are re-applied to the new content.
      const regenerated = withRecordedEdits(
        existing.contentEdits,
        keepServicesOnRegeneration(existing, merged.industry, await regenerateSiteContent(merged)),
      );
      data = { ...data, ...regenerated };
    }

    const site = await prisma.generatedSite.update({
      where: { id },
      data,
      include: { template: true },
    });

    await revalidateSiteFrontendCache(site.slug);
    if (site.slug !== existing.slug) {
      await revalidateSiteFrontendCache(existing.slug);
    }

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
    const regenerated = withRecordedEdits(
      existing.contentEdits,
      keepServicesOnRegeneration(existing, existing.industry, await regenerateSiteContent(existing)),
    );

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
    await revalidateSiteById(req.params.siteId);
    return res.status(201).json({
      success: true,
      data: { pages },
      requestId: req.requestId,
    });
  }),
);

/** Real towns within a ZIP radius, before generating any pages (admin only). */
router.get(
  '/sites/:siteId/location-pages/radius-preview',
  asyncHandler(async (req, res) => {
    const data = await previewRadiusTowns(req.params.siteId, {
      zipCode: String(req.query.zipCode ?? req.query.zip ?? '').trim(),
      radiusMiles: Number(req.query.radiusMiles ?? req.query.radius ?? 0),
    });
    return res.json({ success: true, data, requestId: req.requestId });
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
    await revalidateSiteById(req.params.siteId);

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

/**
 * Adds a service. Only `title` is required: any of shortDescription, fullDescription
 * and icon left empty is written by the AI for this site (same prompts as a new site's
 * services). The service's own page is generated in the background right away.
 */
router.post(
  '/sites/:id/services',
  asyncHandler(async (req, res) => {
    const existing = await getGeneratedSiteById(req.params.id);

    const title = normalizeServiceTitle(req.body?.title);
    if (!title) {
      throw new AppError('Field `title` is required.', 400, { code: 'INVALID_BODY' });
    }
    validateServiceTitle(title);

    const servicesContent = parseSiteJsonContent(existing.servicesContent, 'servicesContent');
    const homeContent = parseSiteJsonContent(existing.homeContent, 'homeContent');

    const services = Array.isArray(servicesContent.services) ? [...servicesContent.services] : [];
    const homeServices = Array.isArray(homeContent.services) ? [...homeContent.services] : [];

    const newSlug = serviceSlugOf(title);
    if (services.some((s) => serviceSlugOf(s?.title) === newSlug)) {
      throw new AppError(`This site already has a service called "${title}".`, 409, { code: 'SERVICE_EXISTS' });
    }

    const given = {
      shortDescription: String(req.body?.shortDescription ?? '').trim(),
      fullDescription: String(req.body?.fullDescription ?? '').trim(),
      icon: String(req.body?.icon ?? '').trim(),
    };
    const generated =
      given.shortDescription && given.fullDescription && given.icon ? null : await generateServiceContent(existing, title);
    const service = {
      title,
      shortDescription: given.shortDescription || generated.shortDescription,
      fullDescription: given.fullDescription || generated.fullDescription,
      icon: given.icon || generated.icon,
    };

    services.push(service);
    homeServices.push({
      title,
      description: service.shortDescription,
      icon: service.icon,
    });

    const site = await prisma.generatedSite.update({
      where: { id: existing.id },
      data: {
        servicesContent: JSON.stringify({ ...servicesContent, services }),
        homeContent: JSON.stringify({ ...homeContent, services: homeServices }),
      },
      include: { template: true },
    });
    await revalidateSiteFrontendCache(site.slug);

    // Build the service's own page now, so its first visitor doesn't wait for it.
    void getOrGenerateServicePage(site, newSlug, service).then(
      () => revalidateSiteFrontendCache(site.slug),
      (error) =>
        console.warn(
          JSON.stringify({ event: 'service_page_pregenerate_failed', siteId: site.id, serviceSlug: newSlug, error: error?.message }),
        ),
    );

    return res.status(201).json({
      success: true,
      data: { site: serializeSiteWithTheme(site), service, generated: Boolean(generated) },
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

    const [removed] = services.splice(serviceIndex, 1);
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

    // Drop the removed service's generated page (unless another listed service
    // has the same slug), then purge the renderer cache so it 404s now.
    const removedSlug = slugifySite(typeof removed?.title === 'string' ? removed.title : '');
    const stillListed = services.some((s) => slugifySite(String(s?.title ?? '')) === removedSlug);
    if (removedSlug && !stillListed) {
      await prisma.servicePage.deleteMany({ where: { siteId: existing.id, serviceSlug: removedSlug } });
    }
    await revalidateSiteFrontendCache(site.slug);

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
    await revalidateSiteFrontendCache(existing.slug);

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

// ---- Keyword pages (on request only; never part of the automatic build) ----

router.get(
  '/sites/:siteId/keyword-pages',
  asyncHandler(async (req, res) => {
    const pages = await listKeywordPages(req.params.siteId);
    return res.json({ success: true, data: { pages }, requestId: req.requestId });
  }),
);

/**
 * Body: { keywords: string | string[], locationPageIds: string[] }. Validates, then creates DRAFTs in
 * the background; poll GET .../keyword-pages/jobs/:jobId for progress and the result.
 */
router.post(
  '/sites/:siteId/keyword-pages',
  asyncHandler(async (req, res) => {
    const job = await startKeywordGeneration(req.params.siteId, {
      keywords: req.body?.keywords,
      locationPageIds: req.body?.locationPageIds,
    });
    return res.status(202).json({ success: true, data: { job }, requestId: req.requestId });
  }),
);

router.get(
  '/sites/:siteId/keyword-pages/jobs/:jobId',
  asyncHandler(async (req, res) => {
    const job = getKeywordJob(req.params.siteId, req.params.jobId);
    return res.json({ success: true, data: { job }, requestId: req.requestId });
  }),
);

router.post(
  '/sites/:siteId/keyword-pages/:id/publish',
  asyncHandler(async (req, res) => {
    const page = await setKeywordPagePublished(req.params.siteId, req.params.id, true);
    await revalidateSiteById(req.params.siteId);
    return res.json({ success: true, data: { page }, requestId: req.requestId });
  }),
);

router.post(
  '/sites/:siteId/keyword-pages/:id/unpublish',
  asyncHandler(async (req, res) => {
    const page = await setKeywordPagePublished(req.params.siteId, req.params.id, false);
    await revalidateSiteById(req.params.siteId);
    return res.json({ success: true, data: { page }, requestId: req.requestId });
  }),
);

router.delete(
  '/sites/:siteId/keyword-pages/:id',
  asyncHandler(async (req, res) => {
    const page = await deleteKeywordPage(req.params.siteId, req.params.id);
    await revalidateSiteById(req.params.siteId);
    return res.json({ success: true, data: { deleted: true, slug: page.slug }, requestId: req.requestId });
  }),
);

// ---- Site address (slug) changes with 301s from every old URL ----

/** Body: { slug } — the new address. The old one keeps working as a 301 to the new one. */
router.post(
  '/sites/:id/change-url',
  asyncHandler(async (req, res) => {
    const result = await changeSiteSlug(req.params.id, req.body?.slug);
    const site = await getGeneratedSiteById(req.params.id);
    return res.json({
      success: true,
      data: { site: serializeSiteWithTheme(site), oldSlug: result.oldSlug, newSlug: result.newSlug, redirects: result.redirects },
      requestId: req.requestId,
    });
  }),
);

router.get(
  '/sites/:id/redirects',
  asyncHandler(async (req, res) => {
    const redirects = await listSiteRedirects(req.params.id);
    return res.json({ success: true, data: { redirects }, requestId: req.requestId });
  }),
);

/** Renderer: every old slug and the site's current slug. */
router.get(
  '/site-redirects',
  asyncHandler(async (req, res) => {
    const redirects = await getRedirectMap();
    return res.json({ success: true, data: { redirects }, requestId: req.requestId });
  }),
);

// ---- Custom domains (nginx + certificate on the frontend server) ----

router.get(
  '/sites/:id/domain',
  asyncHandler(async (req, res) => {
    const domain = await getSiteDomain(req.params.id);
    return res.json({ success: true, data: { domain }, requestId: req.requestId });
  }),
);

/** Body: { domain } — e.g. "www.acmehvac.com"; empty or null removes it. Starts unverified. */
router.put(
  '/sites/:id/domain',
  asyncHandler(async (req, res) => {
    const domain = await setSiteDomain(req.params.id, req.body?.domain);
    return res.json({ success: true, data: { domain }, requestId: req.requestId });
  }),
);

/** Checks DNS and HTTPS; the domain goes live when both pass. */
router.post(
  '/sites/:id/domain/verify',
  asyncHandler(async (req, res) => {
    const result = await verifySiteDomain(req.params.id);
    return res.json({ success: true, data: result, requestId: req.requestId });
  }),
);

/** Renderer: every active site's domain (routing, and 301s once live). */
router.get(
  '/custom-domains',
  asyncHandler(async (req, res) => {
    const domains = await listCustomDomains();
    return res.json({ success: true, data: { domains }, requestId: req.requestId });
  }),
);

// ---- Page text and images (dashboard editor) ----

/** :page = home | about | services | contact | service:{serviceSlug} */
router.get(
  '/sites/:siteId/editor/:page',
  asyncHandler(async (req, res) => {
    const editor = await getPageEditor(req.params.siteId, req.params.page);
    if (req.params.page === 'services') {
      const site = await getGeneratedSiteById(req.params.siteId);
      const services = parseJsonSafe(site.servicesContent).services ?? [];
      editor.services = services.map((s, index) => ({
        index,
        title: String(s?.title ?? ''),
        slug: slugifySite(String(s?.title ?? '')),
      }));
    }
    return res.json({ success: true, data: editor, requestId: req.requestId });
  }),
);

/** Body: { edits: [{ path, value }] } */
router.put(
  '/sites/:siteId/editor/:page',
  asyncHandler(async (req, res) => {
    const editor = await savePageEdits(req.params.siteId, req.params.page, req.body?.edits);
    return res.json({ success: true, data: editor, requestId: req.requestId });
  }),
);

/** Body: { path } — puts that text back to what was generated. */
router.post(
  '/sites/:siteId/editor/:page/revert',
  asyncHandler(async (req, res) => {
    const editor = await revertPageEdit(req.params.siteId, req.params.page, String(req.body?.path ?? ''));
    return res.json({ success: true, data: editor, requestId: req.requestId });
  }),
);

/** Creates a service's detail page now, so its text can be edited before anyone visits it. */
router.post(
  '/sites/:siteId/editor/:page/generate',
  asyncHandler(async (req, res) => {
    const match = /^service:([a-z0-9-]+)$/.exec(req.params.page);
    if (!match) throw new AppError('Only service pages can be generated here.', 400, { code: 'INVALID_PAGE' });
    const site = await getGeneratedSiteById(req.params.siteId);
    const service = findServiceBySlug(site, match[1]);
    if (!service) throw new AppError('Service not found.', 404, { code: 'SERVICE_NOT_FOUND' });
    await getOrGenerateServicePage(site, match[1], service);
    const editor = await getPageEditor(req.params.siteId, req.params.page);
    return res.json({ success: true, data: editor, requestId: req.requestId });
  }),
);

router.get(
  '/sites/:siteId/image-slots',
  asyncHandler(async (req, res) => {
    const slots = await listImageSlots(req.params.siteId);
    return res.json({ success: true, data: { slots }, requestId: req.requestId });
  }),
);

/** Body: { url, source: 'PICKED' | 'UPLOAD' } */
router.put(
  '/sites/:siteId/image-slots/:slotId',
  asyncHandler(async (req, res) => {
    const slot = await setSiteImage(req.params.siteId, req.params.slotId, req.body ?? {});
    return res.json({ success: true, data: { slot }, requestId: req.requestId });
  }),
);

router.get(
  '/sites/:siteId/stock-photos',
  asyncHandler(async (req, res) => {
    const photos = await searchStockPhotos(req.query?.q);
    return res.json({ success: true, data: { photos }, requestId: req.requestId });
  }),
);

// ---- Blog (per site; the renderer only ever sees published posts) ----

router.get(
  '/sites/:siteId/blog',
  asyncHandler(async (req, res) => {
    const [settings, posts] = await Promise.all([getBlogSettings(req.params.siteId), listBlogPosts(req.params.siteId)]);
    return res.json({ success: true, data: { settings, posts }, requestId: req.requestId });
  }),
);

/** Copies the posts generated with the site into the editable list (once; later calls do nothing). */
router.post(
  '/sites/:siteId/blog/import',
  asyncHandler(async (req, res) => {
    const result = await importLegacyPosts(req.params.siteId);
    return res.json({ success: true, data: result, requestId: req.requestId });
  }),
);

/** Body: { blogEnabled?, autoEnabled?, days?: number[], hour?: number, timezone?: string } */
router.put(
  '/sites/:siteId/blog/settings',
  asyncHandler(async (req, res) => {
    const settings = await updateBlogSettings(req.params.siteId, req.body ?? {});
    return res.json({ success: true, data: { settings }, requestId: req.requestId });
  }),
);

router.post(
  '/sites/:siteId/blog/posts',
  asyncHandler(async (req, res) => {
    const post = await createBlogPost(req.params.siteId, req.body ?? {});
    return res.status(201).json({ success: true, data: { post }, requestId: req.requestId });
  }),
);

router.patch(
  '/sites/:siteId/blog/posts/:postId',
  asyncHandler(async (req, res) => {
    const post = await updateBlogPost(req.params.siteId, req.params.postId, req.body ?? {});
    return res.json({ success: true, data: { post }, requestId: req.requestId });
  }),
);

router.delete(
  '/sites/:siteId/blog/posts/:postId',
  asyncHandler(async (req, res) => {
    const result = await deleteBlogPost(req.params.siteId, req.params.postId);
    return res.json({ success: true, data: result, requestId: req.requestId });
  }),
);

const MAX_SITE_IMAGE_BYTES = 8 * 1024 * 1024;

/** Multipart field "file" (+ optional "kind"): stores an image for this site and returns its URL. */
router.post(
  '/sites/:siteId/uploads',
  parseImageMultipart,
  asyncHandler(async (req, res) => {
    const { stat, unlink } = await import('node:fs/promises');
    const file = req.uploadedFile;
    try {
      const site = await prisma.generatedSite.findUnique({ where: { id: req.params.siteId }, select: { id: true } });
      if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
      if ((await stat(file.path)).size > MAX_SITE_IMAGE_BYTES) {
        throw new AppError('Images must be 8 MB or smaller.', 400, { code: 'FILE_TOO_LARGE' });
      }
      const kind = typeof req.body?.kind === 'string' ? req.body.kind : 'images';
      const url = await uploadSiteImage(file.path, site.id, kind);
      return res.status(201).json({ success: true, data: { url }, requestId: req.requestId });
    } finally {
      if (file?.path) await unlink(file.path).catch(() => {});
    }
  }),
);

/** Renderer: blog state + published post summaries (managed=false means "use blogContent"). */
router.get(
  '/sites/:slug/published-blog',
  asyncHandler(async (req, res) => {
    const blog = await getPublicBlog(req.params.slug);
    return res.json({ success: true, data: blog, requestId: req.requestId });
  }),
);

router.get(
  '/sites/:slug/published-blog/:postSlug',
  asyncHandler(async (req, res) => {
    const post = await getPublicBlogPost(req.params.slug, req.params.postSlug);
    return res.json({ success: true, data: { post }, requestId: req.requestId });
  }),
);

/** Renderer: published keyword pages only (drafts never leave the admin API). */
router.get(
  '/sites/:slug/published-keyword-pages',
  asyncHandler(async (req, res) => {
    const pages = await listPublishedKeywordPages(req.params.slug);
    return res.json({ success: true, data: { pages }, requestId: req.requestId });
  }),
);

router.get(
  '/sites/:slug/published-keyword-pages/:keywordSlug',
  asyncHandler(async (req, res) => {
    const page = await getPublishedKeywordPage(req.params.slug, req.params.keywordSlug);
    return res.json({ success: true, data: { page }, requestId: req.requestId });
  }),
);

export default router;
