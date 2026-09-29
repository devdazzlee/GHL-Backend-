import { siteOriginFor, siteUrlFor } from '@/src/lib/siteLinks';
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

/** root: the site's home URL (siteUrlFor(site)). */
export function businessSchemaId(root: string): string {
  return `${root}#business`;
}

function websiteSchemaId(root: string): string {
  return `${root}#website`;
}

/** postPath: the post's slug, or its index for posts still stored with the site. */
function articleSchemaId(root: string, postPath: string | number): string {
  return `${root}/blog/${postPath}#article`;
}

function serviceSchemaId(root: string, serviceSlug: string): string {
  return `${root}/services/${serviceSlug}#service`;
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
    '@id': businessSchemaId(siteUrlFor(site)),
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
    url: `${siteUrlFor(site)}`,
  };
  if (site.logoUrl) node.logo = site.logoUrl;
  if (imageUrl || site.logoUrl) node.image = imageUrl || site.logoUrl;
  return node;
}

function buildBreadcrumbNode(
  site: GeneratedSite,
  items: Array<{ label: string; href?: string }>,
): Record<string, unknown> {
  const baseUrl = `${siteUrlFor(site)}`;
  const list = [
    { name: 'Home', item: baseUrl },
    ...items.map((entry) => ({
      name: entry.label,
      item: entry.href ? `${siteOriginFor(site)}${entry.href}` : undefined,
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
    '@id': websiteSchemaId(siteUrlFor(site)),
    name: site.businessName,
    url: `${siteUrlFor(site)}`,
    publisher: { '@id': businessSchemaId(siteUrlFor(site)) },
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
    '@id': serviceSchemaId(siteUrlFor(site), serviceSlug),
    name: serviceTitle,
    description,
    url: `${siteUrlFor(site)}/services/${serviceSlug}`,
    provider: { '@id': businessSchemaId(siteUrlFor(site)) },
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
    '@id': `${siteUrlFor(site)}/${locationSlug}#location`,
    name: `${site.businessName} — ${city}`,
    url: `${siteUrlFor(site)}/${locationSlug}`,
    parentOrganization: { '@id': businessSchemaId(siteUrlFor(site)) },
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
  const url = `${siteUrlFor(site)}/about`;
  return (
    <JsonLdGraph
      nodes={[
        {
          '@type': 'AboutPage',
          '@id': `${url}#webpage`,
          url,
          name: `About ${site.businessName}`,
          description: description || site.description || '',
          isPartOf: { '@id': websiteSchemaId(siteUrlFor(site)) },
          about: { '@id': businessSchemaId(siteUrlFor(site)) },
          mainEntity: { '@id': businessSchemaId(siteUrlFor(site)) },
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
  const url = `${siteUrlFor(site)}/contact`;
  return (
    <JsonLdGraph
      nodes={[
        {
          '@type': 'ContactPage',
          '@id': `${url}#webpage`,
          url,
          name: `Contact ${site.businessName}`,
          description: description || `Contact ${site.businessName} in ${site.city}, ${site.state}.`,
          isPartOf: { '@id': websiteSchemaId(siteUrlFor(site)) },
          about: { '@id': businessSchemaId(siteUrlFor(site)) },
          mainEntity: { '@id': businessSchemaId(siteUrlFor(site)) },
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
  const url = `${siteUrlFor(site)}/blog`;
  return (
    <JsonLdGraph
      nodes={[
        {
          '@type': 'CollectionPage',
          '@id': `${url}#webpage`,
          url,
          name: `${site.businessName} Blog`,
          description: description || `Articles and tips from ${site.businessName}.`,
          isPartOf: { '@id': websiteSchemaId(siteUrlFor(site)) },
          about: { '@id': businessSchemaId(siteUrlFor(site)) },
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
  postPath,
}: {
  title: string;
  excerpt: string;
  businessName: string;
  slug: string;
  postPath: string | number;
}) {
  return (
    <JsonLd
      schema={{
        '@context': 'https://schema.org',
        ...buildArticleNode(title, excerpt, businessName, siteUrlFor({ slug }), postPath),
      }}
    />
  );
}

function buildArticleNode(
  title: string,
  excerpt: string,
  businessName: string,
  /** The site's home URL (siteUrlFor(site)). */
  root: string,
  postPath: string | number,
  imageUrl?: string | null,
  dates?: { published?: string | null; modified?: string | null },
): Record<string, unknown> {
  const url = `${root}/blog/${postPath}`;
  const node: Record<string, unknown> = {
    '@type': 'Article',
    '@id': articleSchemaId(root, postPath),
    headline: title,
    description: excerpt,
    author: { '@type': 'Organization', name: businessName },
    publisher: { '@id': businessSchemaId(root) },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
  };
  if (imageUrl) node.image = imageUrl;
  if (dates?.published) node.datePublished = dates.published;
  if (dates?.modified ?? dates?.published) node.dateModified = dates?.modified ?? dates?.published;
  return node;
}

/** Single @graph for a blog post: Article + optional FAQPage + BreadcrumbList. */
export function BlogPostJsonLd({
  title,
  excerpt,
  businessName,
  postPath,
  site,
  faqs,
  breadcrumbItems,
  imageUrl,
  datePublished,
  dateModified,
}: {
  title: string;
  excerpt: string;
  businessName: string;
  postPath: string | number;
  site: GeneratedSite;
  faqs?: { question: string; answer: string }[];
  breadcrumbItems: Array<{ label: string; href?: string }>;
  imageUrl?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
}) {
  const nodes: Record<string, unknown>[] = [
    buildArticleNode(title, excerpt, businessName, siteUrlFor(site), postPath, imageUrl, { published: datePublished, modified: dateModified }),
    buildBreadcrumbNode(site, breadcrumbItems),
  ];
  const faq = buildFaqNode(faqs ?? []);
  if (faq) nodes.push(faq);
  return <JsonLdGraph nodes={nodes} />;
}
