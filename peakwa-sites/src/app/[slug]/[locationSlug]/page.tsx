import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, MapPin, Users } from 'lucide-react';
import clsx from 'clsx';
import { buildPageMetadata } from '@/src/lib/seo';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { CtaBanner } from '@/src/components/CtaBanner';
import { FaqAccordion } from '@/src/components/FaqAccordion';
import { HeroBanner } from '@/src/components/HeroBanner';
import { FAQSchema, LocationAreaSchema } from '@/src/components/SchemaMarkup';
import { SeoContentSection } from '@/src/components/SeoContentSection';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { getLocationPages, getSiteBySlug } from '@/src/lib/api';
import { parseJson, type SeoExtraContent, type ServicesContent } from '@/src/lib/content';
import { serviceRelatedLinks } from '@/src/lib/seoLinks';
import { hexToRgb, resolveTheme } from '@/src/lib/theme';
import type { GeneratedSite } from '@/src/lib/types';
import { resolveDesignPreset } from '@/src/designs/presets';
import {
  buttonRadiusStyle,
  cardChromeStyle,
  headingAlignClass,
  heroBannerProps,
  sectionBg,
  sectionPadClass,
  valuesGridClass,
} from '@/src/designs/chrome';

type LocationPageContent = {
  heroHeading?: string;
  heroSubheading?: string;
  /** @deprecated Legacy nested hero format */
  hero?: { heading?: string; subheading?: string };
  localIntro?: string;
  whyLocal?: string;
  serviceArea?: string;
  localStats?: {
    yearsServing?: string;
    customersServed?: string;
    responseTime?: string;
  };
  process?: Array<{ step?: string; description?: string }>;
  faqs?: Array<{ question?: string; answer?: string }>;
  seo?: { title?: string; metaDescription?: string };
  seoExtra?: SeoExtraContent;
  /** @deprecated Legacy CTA format */
  cta?: { heading?: string; buttonText?: string };
};

type PageProps = { params: Promise<{ slug: string; locationSlug: string }> };

const RESERVED_LOCATION_SLUGS = new Set([
  'about',
  'services',
  'blog',
  'contact',
  'sitemap.xml',
  'robots.txt',
]);

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function resolveHeroHeading(content: LocationPageContent, site: GeneratedSite, city: string) {
  return content.heroHeading || content.hero?.heading || `${site.businessName} in ${city}`;
}

function resolveHeroSubheading(content: LocationPageContent, site: GeneratedSite, city: string) {
  return (
    content.heroSubheading ||
    content.hero?.subheading ||
    `Trusted ${site.industry} services in ${city}, ${site.state}`
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locationSlug } = await params;
  if (RESERVED_LOCATION_SLUGS.has(locationSlug)) return {};
  const site = await getSiteBySlug(slug);
  if (!site) return {};

  const pages = await getLocationPages(slug);
  const page = pages.find((p) => p.slug === locationSlug);
  if (!page) return {};

  const content = parseJson<LocationPageContent>(page.content, {});
  if (!content.seo?.title || !content.seo?.metaDescription) return {};

  return buildPageMetadata({
    site,
    title: content.seo.title,
    description: content.seo.metaDescription,
    pathParts: [site.slug, locationSlug],
  });
}

export default async function LocationPage({ params }: PageProps) {
  const { slug, locationSlug } = await params;
  if (RESERVED_LOCATION_SLUGS.has(locationSlug)) notFound();
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const pages = await getLocationPages(slug);
  const page = pages.find((p) => p.slug === locationSlug);
  if (!page) notFound();

  const content = parseJson<LocationPageContent>(page.content, {});
  const servicesCatalog = parseJson<ServicesContent>(site.servicesContent, {});
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(site.designVariant);
  const hero = heroBannerProps(design);
  const pad = sectionPadClass(design);
  const heroImage = page.imageUrl;
  const heroHeading = resolveHeroHeading(content, site, page.city);
  const heroSubheading = resolveHeroSubheading(content, site, page.city);

  const stats = [
    site.yearsInBusiness?.trim() || content.localStats?.yearsServing?.trim()
      ? {
          icon: Clock,
          label: 'Years Serving',
          value: site.yearsInBusiness?.trim() || content.localStats!.yearsServing!.trim(),
        }
      : null,
    site.customersServed?.trim() || content.localStats?.customersServed?.trim()
      ? {
          icon: Users,
          label: 'Customers Served',
          value: site.customersServed?.trim() || content.localStats!.customersServed!.trim(),
        }
      : null,
    content.localStats?.responseTime?.trim()
      ? {
          icon: MapPin,
          label: 'Response Time',
          value: content.localStats.responseTime.trim(),
        }
      : {
          icon: MapPin,
          label: 'Service Area',
          value: page.city,
        },
  ].filter(Boolean) as Array<{ icon: typeof Clock; label: string; value: string }>;

  const processSteps = (content.process ?? []).filter((step) => step.step || step.description);
  const faqs = (content.faqs ?? []).filter(
    (faq): faq is { question: string; answer: string } => Boolean(faq.question && faq.answer),
  );

  // Alternate section backgrounds by design rhythm / family
  let sectionIndex = 0;
  const nextSectionBg = (preferSoft = false) => {
    const role =
      preferSoft || sectionIndex % 2 === 1
        ? design.sectionRhythm === 'boldBands' && sectionIndex % 3 === 2
          ? 'bold'
          : 'soft'
        : 'plain';
    sectionIndex += 1;
    return sectionBg(design, role, theme);
  };

  return (
    <>
      <LocationAreaSchema
        site={site}
        city={page.city}
        county={page.county}
        state={page.state}
        locationSlug={locationSlug}
        imageUrl={heroImage}
      />
      <HeroBanner
        site={site}
        heroImage={heroImage}
        title={heroHeading}
        subtitle={heroSubheading}
        compact={hero.compact}
        centered={hero.centered}
      >
        <Breadcrumbs site={site} items={[{ label: `${page.city}, ${page.county} County` }]} />
      </HeroBanner>

      {content.localIntro ? (
        <SectionWrapper background={nextSectionBg(false)} className={pad}>
          <div className="mx-auto max-w-6xl">
            <div className={headingAlignClass(design)}>
              <h2
                className={clsx(
                  'text-3xl text-gray-900 md:text-4xl',
                  design.family === 'bold' && 'font-bold uppercase tracking-wide',
                  design.family === 'editorial' && 'font-medium',
                  design.family !== 'bold' && design.family !== 'editorial' && 'font-bold',
                )}
              >
                {site.industry.charAt(0).toUpperCase() + site.industry.slice(1)} in {page.city},{' '}
                {page.state}
              </h2>
              <div
                className={clsx(
                  'my-5 h-1 w-14 rounded-full',
                  headingAlignClass(design) === 'text-center' && 'mx-auto',
                )}
                style={{ backgroundColor: theme.accentColor }}
              />
              <p
                className={clsx(
                  'max-w-4xl text-base leading-7 text-gray-600 md:text-[17px] md:leading-8',
                  headingAlignClass(design) === 'text-center' && 'mx-auto',
                )}
              >
                {content.localIntro}
              </p>
            </div>
          </div>
        </SectionWrapper>
      ) : null}

      <SectionWrapper background={nextSectionBg(true)} className={pad}>
        <div className={valuesGridClass(design)}>
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="flex flex-col items-center bg-white p-8 text-center"
              style={cardChromeStyle()}
            >
              <span
                className="mb-4 inline-flex p-3"
                style={{
                  backgroundColor: colorWithOpacity(theme.accentColor, 0.12),
                  color: theme.accentColor,
                  ...buttonRadiusStyle(),
                }}
              >
                <stat.icon className="h-6 w-6" />
              </span>
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              <p className="mt-2 text-sm font-medium text-gray-600">{stat.label}</p>
            </article>
          ))}
        </div>
      </SectionWrapper>

      {content.whyLocal ? (
        <SectionWrapper background={nextSectionBg(false)} className={pad}>
          <div className="mx-auto max-w-6xl">
            <div className={headingAlignClass(design)}>
              <h2
                className={clsx(
                  'text-3xl text-gray-900 md:text-4xl',
                  design.family === 'bold' && 'font-bold uppercase tracking-wide',
                  design.family === 'editorial' && 'font-medium',
                  design.family !== 'bold' && design.family !== 'editorial' && 'font-bold',
                )}
              >
                Why {page.city} Residents Choose {site.businessName}
              </h2>
              <div
                className={clsx(
                  'my-5 h-1 w-14 rounded-full',
                  headingAlignClass(design) === 'text-center' && 'mx-auto',
                )}
                style={{ backgroundColor: theme.accentColor }}
              />
              <p
                className={clsx(
                  'max-w-4xl text-base leading-7 text-gray-600 md:text-[17px] md:leading-8',
                  headingAlignClass(design) === 'text-center' && 'mx-auto',
                )}
              >
                {content.whyLocal}
              </p>
            </div>
          </div>
        </SectionWrapper>
      ) : null}

      {processSteps.length > 0 ? (
        <SectionWrapper background={nextSectionBg(true)} className={pad}>
          <div className="mx-auto max-w-4xl">
            <h2
              className={clsx(
                'mb-12 text-3xl text-gray-900',
                headingAlignClass(design),
                design.family === 'bold' && 'font-bold uppercase tracking-wide',
                design.family === 'editorial' && 'font-medium',
                design.family !== 'bold' && design.family !== 'editorial' && 'font-bold',
              )}
            >
              How We Serve {page.city}
            </h2>
            <div className={valuesGridClass(design)}>
              {processSteps.map((step, index) => (
                <article
                  key={`${step.step}-${index}`}
                  className="bg-white p-8"
                  style={cardChromeStyle()}
                >
                  <span
                    className="inline-flex h-10 w-10 items-center justify-center text-sm font-bold text-white"
                    style={{ backgroundColor: theme.accentColor, ...buttonRadiusStyle() }}
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-xl font-bold text-gray-900">{step.step}</h3>
                  <p className="mt-3 leading-relaxed text-gray-600">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </SectionWrapper>
      ) : null}

      {content.serviceArea ? (
        <SectionWrapper background={nextSectionBg(false)} className={pad}>
          <div className="mx-auto max-w-3xl">
            <h2
              className={clsx(
                'text-3xl text-gray-900',
                headingAlignClass(design),
                design.family === 'bold' && 'font-bold uppercase tracking-wide',
                design.family === 'editorial' && 'font-medium',
                design.family !== 'bold' && design.family !== 'editorial' && 'font-bold',
              )}
            >
              Areas We Serve Near {page.city}
            </h2>
            <p
              className={clsx(
                'mt-8 text-lg leading-relaxed text-gray-600',
                headingAlignClass(design),
              )}
            >
              {content.serviceArea}
            </p>
          </div>
        </SectionWrapper>
      ) : null}

      {faqs.length > 0 ? (
        <SectionWrapper background={nextSectionBg(true)} className={pad}>
          <FAQSchema faqs={faqs} />
          <div className="mx-auto max-w-3xl">
            <h2
              className={clsx(
                'mb-8 text-3xl text-gray-900',
                headingAlignClass(design),
                design.family === 'bold' && 'font-bold uppercase tracking-wide',
                design.family === 'editorial' && 'font-medium',
                design.family !== 'bold' && design.family !== 'editorial' && 'font-bold',
              )}
            >
              Frequently Asked Questions — {page.city}
            </h2>
            <FaqAccordion faqs={faqs} accentColor={theme.accentColor} />
          </div>
        </SectionWrapper>
      ) : null}

      <SeoContentSection
        site={site}
        seoExtra={content.seoExtra}
        showFaqs={false}
        currentPath={locationSlug}
        relatedLinks={[
          { label: 'Back to home', href: '' },
          { label: 'All services', href: 'services' },
          ...serviceRelatedLinks(servicesCatalog.services, { limit: 2 }),
          { label: 'Get in touch', href: 'contact' },
        ]}
      />

      <CtaBanner
        site={site}
        heading={content.cta?.heading || `Ready to Get Started in ${page.city}?`}
        subtext={`Contact ${site.businessName} today for trusted ${site.industry} services in ${page.city}, ${page.state}.`}
        buttonText={content.cta?.buttonText || 'Contact Us'}
      />
    </>
  );
}
