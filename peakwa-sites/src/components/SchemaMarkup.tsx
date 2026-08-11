import { SITE_BASE_URL } from '@/src/config';
import type { GeneratedSite } from '@/src/lib/types';

/**
 * Structured data (JSON-LD) MUST be present in the server-rendered HTML so
 * crawlers and validators (which parse the initial response, not the hydrated
 * DOM) can read it. That is why we render a plain <script> here instead of
 * next/script — next/script is a client component that only injects the tag
 * after hydration, leaving the SSR HTML without any schema.
 */
function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  const json = JSON.stringify(schema)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

/** One JSON-LD script with an @graph — preferred when a page has multiple types. */
function JsonLdGraph({ nodes }: { nodes: Record<string, unknown>[] }) {
  const filtered = nodes.filter(Boolean);
  if (filtered.length === 0) return null;
  if (filtered.length === 1) {
    return <JsonLd schema={{ '@context': 'https://schema.org', ...filtered[0] }} />;
  }
  return (
    <JsonLd
      schema={{
        '@context': 'https://schema.org',
        '@graph': filtered,
      }}
    />
  );
}

export function businessSchemaId(slug: string): string {
  return `${SITE_BASE_URL}/${slug}#business`;
}

function websiteSchemaId(slug: string): string {
  return `${SITE_BASE_URL}/${slug}#website`;
}

function articleSchemaId(slug: string, postIndex: number): string {
  return `${SITE_BASE_URL}/${slug}/blog/${postIndex}#article`;
}

function serviceSchemaId(slug: string, serviceSlug: string): string {
  return `${SITE_BASE_URL}/${slug}/services/${serviceSlug}#service`;
}

const ARTS_INDUSTRY_MARKERS = [
  'pottery',
  'potter',
  'ceramic art',
  'ceramic',
  'clay',
  'art gallery',
  'gallery',
  'craft',
  'art studio',
  'arts',
  'sculpture',
  'painting class',
  'fine art',
  'visual art',
] as const;

function matchesArtsIndustry(value: string): boolean {
  const lower = value.toLowerCase();
  if (ARTS_INDUSTRY_MARKERS.some((marker) => lower.includes(marker))) return true;
  // e.g. "Ceramic Art & Pottery Studio"
  return lower.includes('art') && lower.includes('studio');
}

/**
 * Maps industry strings to schema.org LocalBusiness subtypes.
 * Arts/pottery/studio businesses get ArtGallery for richer rich-result typing.
 * Optional description fallback covers vague industry labels.
 */
export function resolveBusinessTypes(
  industry: string,
  description?: string | null,
): string | string[] {
  const value = industry.toLowerCase();
  if (value.includes('real estate')) return ['LocalBusiness', 'RealEstateAgent'];
  if (value.includes('dental')) return ['LocalBusiness', 'Dentist'];
  if (value.includes('hvac')) return ['LocalBusiness', 'HVACBusiness'];
  if (value.includes('plumb')) return ['LocalBusiness', 'Plumber'];
  if (matchesArtsIndustry(industry) || (description && matchesArtsIndustry(description))) {
    return ['LocalBusiness', 'ArtGallery'];
  }
  return 'LocalBusiness';
}

function buildLocalBusinessNode(
  site: GeneratedSite,
  imageUrl?: string | null,
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': resolveBusinessTypes(site.industry, site.description),
    '@id': businessSchemaId(site.slug),
    name: site.businessName,
    description: site.description || '',
    address: {
      '@type': 'PostalAddress',
      addressLocality: site.city,
      addressRegion: site.state,
      addressCountry: 'US',
    },
    telephone: site.phone || undefined,
    email: site.email || undefined,
    url: `${SITE_BASE_URL}/${site.slug}`,
  };
  if (imageUrl) node.image = imageUrl;
  return node;
}

function buildBreadcrumbNode(
  site: GeneratedSite,
  items: Array<{ label: string; href?: string }>,
): Record<string, unknown> {
  const baseUrl = `${SITE_BASE_URL}/${site.slug}`;
  const list = [
    { name: 'Home', item: baseUrl },
    ...items.map((entry) => ({
      name: entry.label,
      item: entry.href ? `${SITE_BASE_URL}${entry.href}` : undefined,
    })),
  ];

  return {
    '@type': 'BreadcrumbList',
    itemListElement: list.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      ...(crumb.item ? { item: crumb.item } : {}),
    })),
  };
}

function buildFaqNode(faqs: { question: string; answer: string }[]): Record<string, unknown> | null {
  if (!faqs || faqs.length === 0) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

export function LocalBusinessSchema({
  site,
  imageUrl,
}: {
  site: GeneratedSite;
  imageUrl?: string | null;
}) {
  return (
    <JsonLd
      schema={{
        '@context': 'https://schema.org',
        ...buildLocalBusinessNode(site, imageUrl),
      }}
    />
  );
}

/** Sitewide identity — pair with LocalBusiness on the home page. */
export function WebSiteSchema({ site }: { site: GeneratedSite }) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': websiteSchemaId(site.slug),
    name: site.businessName,
    url: `${SITE_BASE_URL}/${site.slug}`,
    publisher: { '@id': businessSchemaId(site.slug) },
    inLanguage: 'en-US',
  };

  return <JsonLd schema={schema} />;
}

export function BreadcrumbListSchema({
  site,
  items,
}: {
  site: GeneratedSite;
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <JsonLd
      schema={{
        '@context': 'https://schema.org',
        ...buildBreadcrumbNode(site, items),
      }}
    />
  );
}

type SchemaService = {
  title?: string;
  shortDescription?: string;
  description?: string;
};

/**
 * Services index catalog. Root is OfferCatalog (not Service). Offers carry
 * name/description only — no nested `@type: Service` — so validators do not
 * report N Service items on the index (detail pages own the single Service).
 */
export function ServiceSchema({
  businessName,
  services,
  businessSlug,
}: {
  businessName: string;
  services: SchemaService[];
  businessSlug?: string;
}) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: `${businessName} Services`,
    provider: businessSlug
      ? { '@id': businessSchemaId(businessSlug) }
      : { '@type': 'LocalBusiness', name: businessName },
    itemListElement: services.map((s, i) => ({
      '@type': 'Offer',
      position: i + 1,
      name: s.title || '',
      description: s.shortDescription || s.description || '',
    })),
  };

  return <JsonLd schema={schema} />;
}

export function ServiceDetailSchema({
  site,
  serviceTitle,
  description,
  serviceSlug,
}: {
  site: GeneratedSite;
  serviceTitle: string;
  description: string;
  serviceSlug: string;
}) {
  return (
    <JsonLd
      schema={{
        '@context': 'https://schema.org',
        ...buildServiceDetailNode(site, serviceTitle, description, serviceSlug),
      }}
    />
  );
}

function buildServiceDetailNode(
  site: GeneratedSite,
  serviceTitle: string,
  description: string,
  serviceSlug: string,
): Record<string, unknown> {
  return {
    '@type': 'Service',
    '@id': serviceSchemaId(site.slug, serviceSlug),
    name: serviceTitle,
    description,
    url: `${SITE_BASE_URL}/${site.slug}/services/${serviceSlug}`,
    provider: { '@id': businessSchemaId(site.slug) },
    areaServed: {
      '@type': 'City',
      name: site.city,
      containedInPlace: {
        '@type': 'State',
        name: site.state,
      },
    },
  };
}

/**
 * Single @graph for a service detail page: one Service + optional FAQPage + BreadcrumbList.
 * Prefer this over separate ServiceDetailSchema + FAQSchema + BreadcrumbListSchema scripts.
 */
export function ServicePageJsonLd({
  site,
  serviceTitle,
  description,
  serviceSlug,
  faqs,
  breadcrumbItems,
}: {
  site: GeneratedSite;
  serviceTitle: string;
  description: string;
  serviceSlug: string;
  faqs?: { question: string; answer: string }[];
  breadcrumbItems: Array<{ label: string; href?: string }>;
}) {
  const nodes: Record<string, unknown>[] = [
    buildServiceDetailNode(site, serviceTitle, description, serviceSlug),
    buildBreadcrumbNode(site, breadcrumbItems),
  ];
  const faq = buildFaqNode(faqs ?? []);
  if (faq) nodes.push(faq);
  return <JsonLdGraph nodes={nodes} />;
}

/** Location landing pages — ties the business to a specific service area. */
export function LocationAreaSchema({
  site,
  city,
  county,
  state,
  locationSlug,
  imageUrl,
}: {
  site: GeneratedSite;
  city: string;
  county: string;
  state: string;
  locationSlug: string;
  imageUrl?: string | null;
}) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': resolveBusinessTypes(site.industry, site.description),
    '@id': `${SITE_BASE_URL}/${site.slug}/${locationSlug}#location`,
    name: `${site.businessName} — ${city}`,
    url: `${SITE_BASE_URL}/${site.slug}/${locationSlug}`,
    parentOrganization: { '@id': businessSchemaId(site.slug) },
    areaServed: {
      '@type': 'City',
      name: city,
      containedInPlace: {
        '@type': 'AdministrativeArea',
        name: `${county} County, ${state}`,
      },
    },
  };

  if (imageUrl) {
    schema.image = imageUrl;
  }

  return <JsonLd schema={schema} />;
}

/**
 * About page: AboutPage + BreadcrumbList, linked to the business entity.
 */
export function AboutPageJsonLd({
  site,
  description,
  breadcrumbItems,
}: {
  site: GeneratedSite;
  description?: string;
  breadcrumbItems: Array<{ label: string; href?: string }>;
}) {
  const url = `${SITE_BASE_URL}/${site.slug}/about`;
  return (
    <JsonLdGraph
      nodes={[
        {
          '@type': 'AboutPage',
          '@id': `${url}#webpage`,
          url,
          name: `About ${site.businessName}`,
          description: description || site.description || '',
          isPartOf: { '@id': websiteSchemaId(site.slug) },
          about: { '@id': businessSchemaId(site.slug) },
          mainEntity: { '@id': businessSchemaId(site.slug) },
        },
        buildBreadcrumbNode(site, breadcrumbItems),
      ]}
    />
  );
}

/**
 * Contact page: ContactPage + BreadcrumbList, linked to the business entity.
 */
export function ContactPageJsonLd({
  site,
  description,
  breadcrumbItems,
}: {
  site: GeneratedSite;
  description?: string;
  breadcrumbItems: Array<{ label: string; href?: string }>;
}) {
  const url = `${SITE_BASE_URL}/${site.slug}/contact`;
  return (
    <JsonLdGraph
      nodes={[
        {
          '@type': 'ContactPage',
          '@id': `${url}#webpage`,
          url,
          name: `Contact ${site.businessName}`,
          description: description || `Contact ${site.businessName} in ${site.city}, ${site.state}.`,
          isPartOf: { '@id': websiteSchemaId(site.slug) },
          about: { '@id': businessSchemaId(site.slug) },
          mainEntity: { '@id': businessSchemaId(site.slug) },
        },
        buildBreadcrumbNode(site, breadcrumbItems),
      ]}
    />
  );
}

/**
 * Blog index: CollectionPage + BreadcrumbList.
 */
export function BlogIndexJsonLd({
  site,
  description,
  breadcrumbItems,
}: {
  site: GeneratedSite;
  description?: string;
  breadcrumbItems: Array<{ label: string; href?: string }>;
}) {
  const url = `${SITE_BASE_URL}/${site.slug}/blog`;
  return (
    <JsonLdGraph
      nodes={[
        {
          '@type': 'CollectionPage',
          '@id': `${url}#webpage`,
          url,
          name: `${site.businessName} Blog`,
          description: description || `Articles and tips from ${site.businessName}.`,
          isPartOf: { '@id': websiteSchemaId(site.slug) },
          about: { '@id': businessSchemaId(site.slug) },
        },
        buildBreadcrumbNode(site, breadcrumbItems),
      ]}
    />
  );
}

export function FAQSchema({
  faqs,
}: {
  faqs: { question: string; answer: string }[];
}) {
  const node = buildFaqNode(faqs);
  if (!node) return null;
  return <JsonLd schema={{ '@context': 'https://schema.org', ...node }} />;
}

export function ArticleSchema({
  title,
  excerpt,
  businessName,
  slug,
  postIndex,
}: {
  title: string;
  excerpt: string;
  businessName: string;
  slug: string;
  postIndex: number;
}) {
  return (
    <JsonLd
      schema={{
        '@context': 'https://schema.org',
        ...buildArticleNode(title, excerpt, businessName, slug, postIndex),
      }}
    />
  );
}

function buildArticleNode(
  title: string,
  excerpt: string,
  businessName: string,
  slug: string,
  postIndex: number,
): Record<string, unknown> {
  const url = `${SITE_BASE_URL}/${slug}/blog/${postIndex}`;
  return {
    '@type': 'Article',
    '@id': articleSchemaId(slug, postIndex),
    headline: title,
    description: excerpt,
    author: { '@type': 'Organization', name: businessName },
    publisher: { '@id': businessSchemaId(slug) },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
  };
}

/** Single @graph for a blog post: Article + optional FAQPage + BreadcrumbList. */
export function BlogPostJsonLd({
  title,
  excerpt,
  businessName,
  slug,
  postIndex,
  site,
  faqs,
  breadcrumbItems,
}: {
  title: string;
  excerpt: string;
  businessName: string;
  slug: string;
  postIndex: number;
  site: GeneratedSite;
  faqs?: { question: string; answer: string }[];
  breadcrumbItems: Array<{ label: string; href?: string }>;
}) {
  const nodes: Record<string, unknown>[] = [
    buildArticleNode(title, excerpt, businessName, slug, postIndex),
    buildBreadcrumbNode(site, breadcrumbItems),
  ];
  const faq = buildFaqNode(faqs ?? []);
  if (faq) nodes.push(faq);
  return <JsonLdGraph nodes={nodes} />;
}
