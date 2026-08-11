import {
  FLOORS,
  STRUCTURE,
  TARGETS,
  schemaRange,
  schemaIntroScaffoldText,
} from '../services/contentContract.js';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const DEFAULT_SYSTEM_PROMPT =
  'You are a professional SEO website content writer for local businesses. Write in a natural human tone. No corporate buzzwords like exceptional, leverage, seamless, innovative, utilize. Content must be specific to the business name, city and services. Produce rich, in-depth, keyword-optimized copy that naturally weaves in the city, state and industry keywords for strong local SEO — never thin, generic, or filler text. Word counts are HARD REQUIREMENTS: every schema word-range lower bound is a minimum you must meet or exceed; undershooting by even 1 word is a failed response. Do not compress long fields to finish short ones. Generate a comprehensive list of 6 to 8 real, concrete services that a customer would actually search for from this specific type of business. Never use generic placeholder names like "Service One", "Core Service", "Specialty Service" or "Support Service" — always use the real, industry-specific service name. Sound like a real local business owner wrote it. Never invent licensing, insurance, certifications, years in business, customer counts, ratings, or awards unless the business details explicitly support them.';

const SERVICE_SLOTS = STRUCTURE.serviceCatalogMax;

function buildServiceSlots(count, { withFullDescription }) {
  return Array.from({ length: count }, () =>
    withFullDescription
      ? {
          title:
            'real specific service this exact business offers, 2 to 5 words, never a generic label',
          shortDescription: '30-45 words teaser specific to this service and city',
          fullDescription: `${schemaRange('serviceFullDescription')} of in-depth, keyword-optimized detail about this service: what it includes, the process, benefits, and why local customers in this city should choose this business`,
          icon: 'relevant lucide icon name',
        }
      : {
          title:
            'real specific service this exact business offers, 2 to 4 words, never a generic label',
          description: '25-35 words specific to this service and city',
          icon: 'relevant lucide icon name',
        },
  );
}

function buildSeoExtraSchema({ includeFaqs }) {
  const block = {
    heading: 'keyword-optimized H2 with industry and city',
    paragraphs: [
      `${schemaRange('seoExtraParagraph')} keyword-rich local SEO paragraph`,
      `${schemaRange('seoExtraParagraph')} keyword-rich local SEO paragraph with internal navigation context`,
    ],
    links: [
      { label: 'anchor text', href: 'about|services|contact|blog|services/{slug}' },
      { label: 'anchor text', href: 'about|services|contact|blog|services/{slug}' },
      { label: 'anchor text', href: 'about|services|contact|blog|services/{slug}' },
    ],
  };
  if (includeFaqs) {
    block.faqs = Array.from({ length: STRUCTURE.seoExtraFaqCount }, () => ({
      question: 'a real customer question for this page',
      answer: `${schemaRange('faqAnswer')} helpful answer with local and industry detail`,
    }));
  }
  return block;
}

function buildHomePageSchema() {
  return {
    hero: {
      heading: 'max 8 words powerful headline with business name',
      subheading: 'max 20 words supporting statement mentioning city',
      ctaButton: 'max 4 words',
    },
    about: {
      heading: 'max 6 words',
      paragraph1: `${schemaRange('homeAboutParagraph')} introducing the business, its local roots in this city, experience, and the industry services it provides — keyword optimized for local SEO`,
      paragraph2: `${schemaRange('homeAboutParagraph')} on what makes this business different, its commitment to local customers, and why residents in this city and state trust it`,
    },
    services: buildServiceSlots(6, { withFullDescription: false }),
    whyChooseUs: [
      { point: 'max 6 words', detail: '15-20 words' },
      { point: 'max 6 words', detail: '15-20 words' },
      { point: 'max 6 words', detail: '15-20 words' },
      { point: 'max 6 words', detail: '15-20 words' },
    ],
    cta: { heading: 'max 10 words', subtext: 'max 20 words', buttonText: 'max 4 words' },
    seoExtra: buildSeoExtraSchema({ includeFaqs: false }),
    seo: {
      title: '50-60 characters including business name, city, and industry (minimum 50)',
      metaDescription:
        '120-155 characters with city, state, industry keywords, and call to action (minimum 120)',
    },
  };
}

function buildAboutPageSchema() {
  return {
    hero: { heading: 'max 8 words', subheading: 'max 20 words' },
    story: {
      heading: 'max 6 words',
      paragraph1: `${schemaRange('aboutStoryParagraph')} on the company history and how it grew serving this city, with local and industry keywords woven in naturally`,
      paragraph2: `${schemaRange('aboutStoryParagraph')} on the mission, values, and long-term commitment to customers in this city and state`,
    },
    team: {
      heading: 'max 6 words',
      description: `${schemaRange('aboutTeamDescription')} about the team, their local expertise, qualifications, and dedication to serving this community`,
    },
    mission: {
      heading: 'max 6 words',
      statement: `${schemaRange('aboutMissionStatement')} on the studio's purpose, who it serves in this city, and its long-term commitment — real prose, not a short slogan`,
    },
    values: [
      { title: 'max 3 words', description: '15-20 words' },
      { title: 'max 3 words', description: '15-20 words' },
      { title: 'max 3 words', description: '15-20 words' },
    ],
    seoExtra: buildSeoExtraSchema({ includeFaqs: true }),
    seo: {
      title: '50-60 characters including business name, city, and industry (minimum 50)',
      metaDescription:
        '120-155 characters with city, state, industry keywords, and call to action (minimum 120)',
    },
  };
}

function buildServicesPageSchema() {
  return {
    hero: { heading: 'max 8 words', subheading: 'max 20 words' },
    intro: schemaIntroScaffoldText('services'),
    services: buildServiceSlots(SERVICE_SLOTS, { withFullDescription: true }),
    cta: { heading: 'max 10 words', buttonText: 'max 4 words' },
    seoExtra: buildSeoExtraSchema({ includeFaqs: true }),
    seo: {
      title: '50-60 characters including business name, city, and industry (minimum 50)',
      metaDescription:
        '120-155 characters with city, state, industry keywords, and call to action (minimum 120)',
    },
  };
}

function buildContactPageSchema() {
  return {
    hero: { heading: 'max 8 words', subheading: 'max 20 words' },
    intro: schemaIntroScaffoldText('contact'),
    formHeading: 'max 6 words',
    addressSection: { heading: 'max 4 words' },
    hoursSection: { heading: 'max 4 words', description: '40-60 words about availability and service area' },
    seoExtra: buildSeoExtraSchema({ includeFaqs: true }),
    seo: {
      title: '50-60 characters including business name, city, and industry (minimum 50)',
      metaDescription:
        '120-155 characters with city, state, industry keywords, and call to action (minimum 120)',
    },
  };
}

function buildLocationPageSchema() {
  return {
    hero: { heading: 'max 10 words mentioning city name', subheading: 'max 20 words' },
    localIntro: `${schemaRange('locationLocalIntro')} specific to that city, mentioning local landmarks, neighborhoods or community, plus the industry services offered there`,
    whyLocal: `${schemaRange('locationWhyLocal')} on why local customers in that city should choose this business, with local and industry keywords woven in`,
    serviceArea: `${schemaRange('locationServiceArea')} about serving that specific area and surrounding neighborhoods, naming nearby places where possible`,
    cta: { heading: 'max 10 words', buttonText: 'max 4 words' },
    seoExtra: buildSeoExtraSchema({ includeFaqs: false }),
    seo: {
      title: '50-60 characters include city name (minimum 50)',
      metaDescription: '120-155 characters include city name (minimum 120)',
    },
  };
}

function buildBlogPageSchema() {
  // Each post targets 1000+ words across introduction, H2/H3 sections, and
  // conclusion. FAQs and internalLinks sit outside that body word count.
  const post = {
    title: 'specific, compelling blog post title, max 12 words',
    excerpt: '40-60 word summary that makes the reader want to open the article',
    category: 'single word topic category',
    readTime: 'X min read',
    introduction: `${schemaRange('blogIntro')} opening paragraph that hooks the reader, introduces the topic, and naturally references the city and industry`,
    sections: Array.from({ length: STRUCTURE.blogH2Count }, () => ({
      heading: 'clear, specific H2 heading, max 8 words',
      paragraphs: [
        `${schemaRange('blogH2Paragraph')} of useful, specific detail with local and industry keywords woven in naturally`,
      ],
      subsections: [
        {
          heading: 'clear, specific H3 heading, max 8 words',
          paragraphs: [
            `${schemaRange('blogH3Paragraph')} expanding a related sub-point with practical advice`,
          ],
        },
      ],
    })),
    conclusion: `${schemaRange('blogConclusion')} closing paragraph that summarizes the key takeaway, reinforces local expertise, and ends with a natural call to action. Body total MUST be at least ${TARGETS.blogBody} words (accept ${FLOORS.blogBody}).`,
    faqs: Array.from({ length: STRUCTURE.blogFaqCount }, () => ({
      question: 'a real question customers ask about this topic',
      answer: `${schemaRange('faqAnswer')} helpful, specific answer with local and industry detail`,
    })),
    internalLinks: [
      {
        label: 'anchor text linking to the services page',
        path: 'services',
      },
      {
        label: 'anchor text linking to the about page',
        path: 'about',
      },
      {
        label: 'anchor text linking to the contact page',
        path: 'contact',
      },
    ],
    seo: {
      title: '50-60 characters with post title, business name, and city (minimum 50)',
      metaDescription:
        '120-155 characters summarizing the article with city and call to action (minimum 120)',
    },
  };

  return {
    posts: [post, post, post],
    seoExtra: buildSeoExtraSchema({ includeFaqs: true }),
    seo: {
      title: '50-60 characters including business name, city, and industry (minimum 50)',
      metaDescription:
        '120-155 characters with city, state, industry keywords, and call to action (minimum 120)',
    },
  };
}

function buildSchemaRecord({ industry, displayName, systemPrompt, isDefault = false }) {
  return {
    industry,
    displayName,
    systemPrompt,
    isDefault,
    homePageSchema: JSON.stringify(buildHomePageSchema()),
    aboutPageSchema: JSON.stringify(buildAboutPageSchema()),
    servicesPageSchema: JSON.stringify(buildServicesPageSchema()),
    contactPageSchema: JSON.stringify(buildContactPageSchema()),
    locationPageSchema: JSON.stringify(buildLocationPageSchema()),
    blogPageSchema: JSON.stringify(buildBlogPageSchema()),
  };
}

const SEED_SCHEMAS = [
  buildSchemaRecord({
    industry: 'general',
    displayName: 'General Business',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    isDefault: true,
  }),
  buildSchemaRecord({
    industry: 'automotive',
    displayName: 'Automotive',
    systemPrompt:
      'You are writing for a car dealership. Focus on vehicle selection, financing options, test drives, service department, certified vehicles, trade-ins. Generate a comprehensive list of 6 to 8 real, specific services offered by automotive dealerships and auto service centers (for example vehicle sales, auto financing, service and repair, trade-in appraisal, parts department). Never use generic placeholder names. Mention specific city. Friendly approachable tone. Word counts are HARD REQUIREMENTS — every schema word-range lower bound is a minimum; do not compress long fields to finish short ones.',
  }),
  buildSchemaRecord({
    industry: 'hvac',
    displayName: 'HVAC',
    systemPrompt:
      'You are writing for an HVAC company. Focus on heating, cooling, emergency service, seasonal maintenance, energy efficiency, fast response time. Mention licensed technicians only when appropriate for HVAC trade work. Generate a comprehensive list of 6 to 8 real, specific HVAC services (for example AC repair, heating installation, duct cleaning, preventive maintenance, indoor air quality). Never use generic placeholder names. Mention specific city and nearby areas. Never invent insurance claims, years in business, or customer counts. Word counts are HARD REQUIREMENTS — every schema word-range lower bound is a minimum; do not compress long fields to finish short ones.',
  }),
  buildSchemaRecord({
    industry: 'business',
    displayName: 'Business Services',
    systemPrompt:
      'You are writing for a professional business services company. Focus on consulting, client results, expertise, reliability, professional advice, business growth. Generate a comprehensive list of 6 to 8 real, specific professional services (for example business consulting, strategic planning, financial advisory, market research). Never use generic placeholder names. Word counts are HARD REQUIREMENTS — every schema word-range lower bound is a minimum; do not compress long fields to finish short ones.',
  }),
];

async function main() {
  console.info(JSON.stringify({ event: 'seed_industry_schemas_start', count: SEED_SCHEMAS.length }));

  for (const schema of SEED_SCHEMAS) {
    await prisma.industrySchema.upsert({
      where: { industry: schema.industry },
      create: schema,
      update: schema,
    });
    console.info(JSON.stringify({ event: 'seed_industry_schema_upserted', industry: schema.industry }));
  }

  if (SEED_SCHEMAS.some((s) => s.isDefault)) {
    await prisma.industrySchema.updateMany({
      where: {
        isDefault: true,
        industry: { not: 'general' },
      },
      data: { isDefault: false },
    });
  }

  console.info(JSON.stringify({ event: 'seed_industry_schemas_complete' }));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ event: 'seed_industry_schemas_failed', error: e?.message ?? String(e) }));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
