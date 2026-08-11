import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Phone } from 'lucide-react';
import { notFound } from 'next/navigation';
import clsx from 'clsx';
import { buildPageMetadata } from '@/src/lib/seo';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { CtaBanner } from '@/src/components/CtaBanner';
import { FaqAccordion } from '@/src/components/FaqAccordion';
import { ServicePageJsonLd } from '@/src/components/SchemaMarkup';
import { SeoContentSection } from '@/src/components/SeoContentSection';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getServicePageContent, getSiteBySlug } from '@/src/lib/api';
import { parseJson, type SeoExtraContent, type ServicesContent } from '@/src/lib/content';
import { getIcon } from '@/src/lib/iconMap';
import { getSiteImages } from '@/src/lib/images';
import { serviceRelatedLinks } from '@/src/lib/seoLinks';
import { getTextColor, hexToRgb, resolveTheme } from '@/src/lib/theme';
import type { GeneratedSite, SiteTheme } from '@/src/lib/types';
import { resolveDesignPreset, type DesignPreset } from '@/src/designs/presets';
import {
  buttonRadiusStyle,
  cardChromeStyle,
  headingAlignClass,
  heroBannerProps,
  sectionPadClass,
  valuesGridClass,
} from '@/src/designs/chrome';

type PageProps = { params: Promise<{ slug: string; serviceSlug: string }> };

type ServicePageContent = {
  heroHeading?: string;
  heroSubheading?: string;
  overview?: string;
  process?: Array<{ step?: string; description?: string }>;
  benefits?: Array<{ title?: string; description?: string }>;
  faqs?: Array<{ question?: string; answer?: string }>;
  whyUs?: string;
  seoExtra?: SeoExtraContent;
  seo?: { title?: string; metaDescription?: string };
};

function slugifyService(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function headingFromParagraph(paragraph: string): string {
  const words = paragraph.replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return 'Service Details';
  const heading = words.join(' ');
  return heading.charAt(0).toUpperCase() + heading.slice(1);
}

function extractBenefits(fullDescription: string): string[] {
  const sentences = fullDescription
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length >= 3) return sentences.slice(0, 3);
  const paragraphs = splitParagraphs(fullDescription);
  if (paragraphs.length >= 3) return paragraphs.slice(0, 3);
  return [
    'Experienced technicians dedicated to quality workmanship.',
    'Transparent pricing with no hidden fees.',
    'Reliable service backed by customer satisfaction.',
  ];
}

function otherServicesGridClass(design: DesignPreset): string {
  if (design.family === 'utility' || design.servicesLayout === 'listRows') {
    return 'grid gap-8 md:grid-cols-1';
  }
  if (design.servicesLayout === 'grid2') return 'grid gap-8 md:grid-cols-2';
  return 'grid gap-8 md:grid-cols-3';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, serviceSlug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return {};

  const services = parseJson<ServicesContent>(site.servicesContent, {});
  const service = services?.services?.find((s) => slugifyService(s.title || '') === serviceSlug);
  if (!service) return {};

  const content = (await getServicePageContent(slug, serviceSlug)) as ServicePageContent | null;
  if (!content?.seo?.title || !content?.seo?.metaDescription) return {};

  return buildPageMetadata({
    site,
    title: content.seo.title,
    description: content.seo.metaDescription,
    pathParts: [slug, 'services', serviceSlug],
  });
}

function ServiceHero({
  site,
  slug,
  serviceTitle,
  serviceImage,
  theme,
  design,
  heading,
  subheading,
}: {
  site: GeneratedSite;
  slug: string;
  serviceTitle: string;
  serviceImage: string | null;
  theme: SiteTheme;
  design: DesignPreset;
  heading: string;
  subheading?: string | null;
}) {
  const hero = heroBannerProps(design);
  const heroTextColor = serviceImage ? '#FFFFFF' : getTextColor(theme.primaryColor);

  return (
    <section
      className={clsx(
        'relative flex items-center overflow-hidden',
        hero.compact ? 'min-h-[280px] md:min-h-[320px]' : 'min-h-[420px] md:min-h-[480px]',
      )}
    >
      {serviceImage ? (
        <>
          <div className="absolute inset-0">
            <SiteImage
              src={serviceImage}
              alt={`${serviceTitle} service`}
              fill
              className="object-cover object-center"
              priority
              sizes="100vw"
              fallback={
                <div className="h-full w-full" style={{ backgroundColor: theme.primaryColor }} />
              }
            />
          </div>
          <div
            className="absolute inset-0"
            style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.7) }}
          />
        </>
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: theme.primaryColor }} />
      )}
      <div
        className={clsx(
          'relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8',
          hero.centered && 'text-center',
        )}
        style={{ color: heroTextColor }}
      >
        <Breadcrumbs
          site={site}
          skipSchema
          items={[
            { label: 'Services', href: `/${slug}/services` },
            { label: serviceTitle },
          ]}
        />
        <h1
          className={clsx(
            'mt-6 text-4xl font-bold md:text-5xl',
            hero.centered ? 'mx-auto max-w-3xl' : 'max-w-3xl',
          )}
        >
          {heading}
        </h1>
        {subheading ? (
          <p
            className={clsx(
              'mt-4 text-lg opacity-90',
              hero.centered ? 'mx-auto max-w-2xl' : 'max-w-2xl',
            )}
          >
            {subheading}
          </p>
        ) : null}
        <div
          className={clsx(
            'mt-8 flex flex-col gap-4 sm:flex-row',
            hero.centered && 'items-center justify-center',
          )}
        >
          <Link
            href={`/${slug}/contact`}
            className="inline-flex items-center justify-center px-8 py-3 text-sm font-semibold shadow-lg transition hover:scale-105"
            style={{
              backgroundColor: theme.accentColor,
              color: getTextColor(theme.accentColor),
              ...buttonRadiusStyle(),
            }}
          >
            Get a Free Quote
          </Link>
          {site.phone ? (
            <a
              href={`tel:${site.phone}`}
              className="inline-flex items-center justify-center gap-2 border-2 border-white px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              style={buttonRadiusStyle()}
            >
              <Phone className="h-4 w-4" />
              {site.phone}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug, serviceSlug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const services = parseJson<ServicesContent>(site.servicesContent, {});
  const allServices = services?.services || [];
  const service = allServices.find((s) => slugifyService(s.title || '') === serviceSlug);
  if (!service) notFound();

  const images = await getSiteImages(slug);
  const serviceIndex = allServices.indexOf(service);
  const serviceImage = images.services[serviceIndex] || images.hero;
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(site.designVariant);
  const pad = sectionPadClass(design);
  const otherServices = allServices
    .filter((s) => slugifyService(s.title || '') !== serviceSlug)
    .slice(0, 3);
  const serviceTitle = service.title || 'Service';

  const content = (await getServicePageContent(slug, serviceSlug)) as ServicePageContent | null;

  if (content) {
    return (
      <ServiceDetailFromContent
        site={site}
        slug={slug}
        serviceTitle={serviceTitle}
        serviceImage={serviceImage}
        overviewImage={images.about ?? images.services[serviceIndex + 1] ?? images.hero}
        theme={theme}
        design={design}
        otherServices={otherServices}
        content={content}
      />
    );
  }

  const paragraphs = splitParagraphs(service.fullDescription || service.shortDescription || '');
  const benefits = extractBenefits(service.fullDescription || service.shortDescription || '');

  const faqs = [
    {
      question: `How much does ${serviceTitle} cost?`,
      answer: `${site.businessName} offers competitive pricing for ${serviceTitle.toLowerCase()} in ${site.city}. Costs vary based on scope and requirements — contact us for a free estimate tailored to your needs.`,
    },
    {
      question: `How long does ${serviceTitle} take?`,
      answer: `Most ${serviceTitle.toLowerCase()} jobs are completed efficiently, with timelines depending on the specific project. We provide a clear schedule upfront so you know exactly what to expect.`,
    },
    {
      question: `Do you offer emergency ${serviceTitle}?`,
      answer: `Yes, ${site.businessName} understands urgent situations. Call us at ${site.phone || 'our office'} for emergency ${serviceTitle.toLowerCase()} availability in ${site.city} and surrounding areas.`,
    },
  ];

  return (
    <>
      <ServicePageJsonLd
        site={site}
        serviceTitle={serviceTitle}
        description={service.fullDescription || service.shortDescription || ''}
        serviceSlug={serviceSlug}
        faqs={faqs}
        breadcrumbItems={[
          { label: 'Services', href: `/${slug}/services` },
          { label: serviceTitle },
        ]}
      />
      <ServiceHero
        site={site}
        slug={slug}
        serviceTitle={serviceTitle}
        serviceImage={serviceImage}
        theme={theme}
        design={design}
        heading={serviceTitle}
        subheading={service.shortDescription}
      />

      <SectionWrapper background="#fff" className={pad}>
        <div className="mx-auto max-w-3xl">
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, i) => (
              <div key={i} className={i > 0 ? 'mt-10' : ''}>
                <h2 className="text-2xl font-bold text-gray-900">
                  {i === 0 ? `About ${serviceTitle}` : headingFromParagraph(paragraph)}
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-gray-600">{paragraph}</p>
              </div>
            ))
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900">About {serviceTitle}</h2>
              <p className="mt-4 text-lg leading-relaxed text-gray-600">
                {service.shortDescription ||
                  `${site.businessName} provides professional ${serviceTitle.toLowerCase()} in ${site.city}, ${site.state}.`}
              </p>
            </>
          )}
        </div>
      </SectionWrapper>

      <SectionWrapper background={theme.secondaryColor} className={pad}>
        <div className="mx-auto max-w-3xl">
          <h2 className={clsx('text-3xl font-bold text-gray-900', headingAlignClass(design))}>
            Why Choose Our {serviceTitle}
          </h2>
          <ul className="mt-10 space-y-6">
            {benefits.map((benefit, i) => (
              <li
                key={i}
                className="flex items-start gap-4 bg-white p-6"
                style={cardChromeStyle()}
              >
                <span className="mt-0.5 shrink-0" style={{ color: theme.accentColor }}>
                  {getIcon('check-circle', 'w-6 h-6')}
                </span>
                <p className="text-lg leading-relaxed text-gray-700">{benefit}</p>
              </li>
            ))}
          </ul>
        </div>
      </SectionWrapper>

      <SectionWrapper background="#fff" className={pad}>
        <div className="mx-auto max-w-3xl">
          <h2 className={clsx('text-3xl font-bold text-gray-900', headingAlignClass(design))}>
            Frequently Asked Questions
          </h2>
          <div className="mt-10">
            <FaqAccordion faqs={faqs} accentColor={theme.accentColor} />
          </div>
        </div>
      </SectionWrapper>

      {otherServices.length > 0 ? (
        <SectionWrapper background={theme.secondaryColor} className={pad}>
          <h2
            className={clsx('mb-10 text-3xl font-bold text-gray-900', headingAlignClass(design))}
          >
            Our Other Services
          </h2>
          <div className={otherServicesGridClass(design)}>
            {otherServices.map((other) => {
              const otherSlug = slugifyService(other.title || '');
              return (
                <Link
                  key={other.title}
                  href={`/${slug}/services/${otherSlug}`}
                  className="group flex flex-col bg-white p-6 transition duration-300 hover:-translate-y-1"
                  style={{
                    ...cardChromeStyle(),
                    borderTop: `4px solid ${theme.accentColor}`,
                  }}
                >
                  <span style={{ color: theme.accentColor }}>
                    {getIcon(other.icon || 'wrench', 'w-8 h-8')}
                  </span>
                  <h3 className="mt-4 text-xl font-bold text-gray-900 group-hover:underline">
                    {other.title}
                  </h3>
                  <p className="mt-2 flex-1 text-gray-600">{other.shortDescription}</p>
                  <span
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
                    style={{ color: theme.accentColor }}
                  >
                    Learn More <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        </SectionWrapper>
      ) : null}

      <CtaBanner
        site={site}
        heading={`Call Us Today for ${serviceTitle}`}
        subtext={
          site.phone
            ? `Reach ${site.businessName} at ${site.phone} — serving ${site.city}, ${site.state}.`
            : `Contact ${site.businessName} today — serving ${site.city}, ${site.state}.`
        }
        buttonText={site.phone ? 'Call Now' : 'Contact Us'}
      />
    </>
  );
}

type ServiceDetailFromContentProps = {
  site: GeneratedSite;
  slug: string;
  serviceTitle: string;
  serviceImage: string | null;
  overviewImage: string | null;
  theme: SiteTheme;
  design: DesignPreset;
  otherServices: Array<{ title?: string; shortDescription?: string; icon?: string }>;
  content: ServicePageContent;
};

function ServiceDetailFromContent({
  site,
  slug,
  serviceTitle,
  serviceImage,
  overviewImage,
  theme,
  design,
  otherServices,
  content,
}: ServiceDetailFromContentProps) {
  const heroHeading = content.heroHeading || serviceTitle;
  const process = content.process || [];
  const benefits = content.benefits || [];
  const faqs = (content.faqs || []).filter(
    (faq): faq is { question: string; answer: string } => Boolean(faq.question && faq.answer),
  );
  const pad = sectionPadClass(design);

  return (
    <>
      <ServicePageJsonLd
        site={site}
        serviceTitle={serviceTitle}
        description={content.overview || ''}
        serviceSlug={slugifyService(serviceTitle)}
        faqs={faqs}
        breadcrumbItems={[
          { label: 'Services', href: `/${slug}/services` },
          { label: serviceTitle },
        ]}
      />
      <ServiceHero
        site={site}
        slug={slug}
        serviceTitle={serviceTitle}
        serviceImage={serviceImage}
        theme={theme}
        design={design}
        heading={heroHeading}
        subheading={content.heroSubheading}
      />

      {content.overview ? (
        <SectionWrapper background="#fff" className={pad}>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">About {serviceTitle}</h2>
              <div
                className="my-6 h-1 w-16 rounded-full"
                style={{ backgroundColor: theme.accentColor }}
              />
              <p className="text-lg leading-relaxed text-gray-600">{content.overview}</p>
            </div>
            {overviewImage ? (
              <div
                className="relative aspect-[16/10] w-full overflow-hidden"
                style={{
                  borderRadius: 'var(--design-card-radius)',
                  boxShadow: 'var(--design-card-shadow)',
                }}
              >
                <SiteImage
                  src={overviewImage}
                  alt={`${serviceTitle} at ${site.businessName}`}
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  fallback={
                    <div
                      className="h-full w-full"
                      style={{ backgroundColor: colorWithOpacity(theme.accentColor, 0.15) }}
                    />
                  }
                />
              </div>
            ) : null}
          </div>
        </SectionWrapper>
      ) : null}

      {process.length > 0 ? (
        <SectionWrapper background={theme.secondaryColor} className={pad}>
          <h2
            className={clsx('mb-12 text-3xl font-bold text-gray-900', headingAlignClass(design))}
          >
            Our Process
          </h2>
          <div className={valuesGridClass(design)}>
            {process.map((step, i) => (
              <div
                key={step.step ?? i}
                className="bg-white p-6 text-center"
                style={cardChromeStyle()}
              >
                <div
                  className="mx-auto flex h-14 w-14 items-center justify-center text-xl font-bold text-white"
                  style={{ backgroundColor: theme.accentColor, ...buttonRadiusStyle() }}
                >
                  {i + 1}
                </div>
                <h3 className="mt-5 text-lg font-bold text-gray-900">{step.step}</h3>
                <p className="mt-3 text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </SectionWrapper>
      ) : null}

      {benefits.length > 0 ? (
        <SectionWrapper background="#fff" className={pad}>
          <h2
            className={clsx('mb-12 text-3xl font-bold text-gray-900', headingAlignClass(design))}
          >
            Benefits of Our {serviceTitle}
          </h2>
          <div className={valuesGridClass(design)}>
            {benefits.map((benefit, i) => (
              <div
                key={benefit.title ?? i}
                className="flex items-start gap-4 bg-white p-6"
                style={{
                  ...cardChromeStyle(),
                  borderTop: `4px solid ${theme.accentColor}`,
                }}
              >
                <span className="mt-0.5 shrink-0" style={{ color: theme.accentColor }}>
                  {getIcon('check-circle', 'w-6 h-6')}
                </span>
                <div>
                  <h3 className="font-bold text-gray-900">{benefit.title}</h3>
                  <p className="mt-2 text-gray-600">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionWrapper>
      ) : null}

      {faqs.length > 0 ? (
        <SectionWrapper background={theme.secondaryColor} className={pad}>
          <div className="mx-auto max-w-3xl">
            <h2 className={clsx('text-3xl font-bold text-gray-900', headingAlignClass(design))}>
              Frequently Asked Questions
            </h2>
            <div className="mt-10">
              <FaqAccordion faqs={faqs} accentColor={theme.accentColor} />
            </div>
          </div>
        </SectionWrapper>
      ) : null}

      {content.whyUs ? (
        <SectionWrapper background="#fff" className={pad}>
          <div className={clsx('mx-auto max-w-3xl', headingAlignClass(design))}>
            <h2 className="text-3xl font-bold text-gray-900">Why Choose {site.businessName}</h2>
            <p className="mt-6 text-lg leading-relaxed text-gray-600">{content.whyUs}</p>
          </div>
        </SectionWrapper>
      ) : null}

      {otherServices.length > 0 ? (
        <SectionWrapper background={theme.secondaryColor} className={pad}>
          <h2
            className={clsx('mb-10 text-3xl font-bold text-gray-900', headingAlignClass(design))}
          >
            Our Other Services
          </h2>
          <div className={otherServicesGridClass(design)}>
            {otherServices.map((other) => {
              const otherSlug = slugifyService(other.title || '');
              return (
                <Link
                  key={other.title}
                  href={`/${slug}/services/${otherSlug}`}
                  className="group flex flex-col bg-white p-6 transition duration-300 hover:-translate-y-1"
                  style={{
                    ...cardChromeStyle(),
                    borderTop: `4px solid ${theme.accentColor}`,
                  }}
                >
                  <span style={{ color: theme.accentColor }}>
                    {getIcon(other.icon || 'wrench', 'w-8 h-8')}
                  </span>
                  <h3 className="mt-4 text-xl font-bold text-gray-900 group-hover:underline">
                    {other.title}
                  </h3>
                  <p className="mt-2 flex-1 text-gray-600">{other.shortDescription}</p>
                  <span
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
                    style={{ color: theme.accentColor }}
                  >
                    Learn More <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        </SectionWrapper>
      ) : null}

      <SeoContentSection
        site={site}
        seoExtra={content.seoExtra}
        showFaqs={false}
        currentPath={`services/${slugifyService(serviceTitle)}`}
        relatedLinks={[
          { label: 'All services', href: 'services' },
          ...serviceRelatedLinks(otherServices, { limit: 3 }),
          { label: 'Get in touch', href: 'contact' },
        ]}
      />

      <CtaBanner
        site={site}
        heading={`Call Us Today for ${serviceTitle}`}
        subtext={
          site.phone
            ? `Reach ${site.businessName} at ${site.phone} — serving ${site.city}, ${site.state}.`
            : `Contact ${site.businessName} today — serving ${site.city}, ${site.state}.`
        }
        buttonText={site.phone ? 'Call Now' : 'Contact Us'}
      />
    </>
  );
}
