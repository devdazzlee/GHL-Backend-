import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildPageMetadata } from '@/src/lib/seo';
import { ArrowRight, MapPin, Quote, Star } from 'lucide-react';
import { CtaBanner } from '@/src/components/CtaBanner';
import { FaqAccordion } from '@/src/components/FaqAccordion';
import { FAQSchema, LocalBusinessSchema, WebSiteSchema } from '@/src/components/SchemaMarkup';
import { SeoContentSection } from '@/src/components/SeoContentSection';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getAllActiveSites, getLocationPages, getSiteBySlug } from '@/src/lib/api';
import { parseJson, type HomeContent } from '@/src/lib/content';
import { getIcon } from '@/src/lib/iconMap';
import { getSiteImages } from '@/src/lib/images';
import { serviceRelatedLinks } from '@/src/lib/seoLinks';
import { getAccessibleForeground, getTextColor, hexToRgb, resolveTheme } from '@/src/lib/theme';
import { industryRequiresLicense } from '@/src/lib/industryClaims';
import { resolveDesignPreset, servicesGridClass } from '@/src/designs/presets';
import { FamilyHero } from '@/src/designs/FamilyHero';
import { getDesignRecipe } from '@/src/designs/catalog';
import { homeSectionFlexOrder } from '@/src/designs/sectionOrder';
import {
  cardChromeStyle,
  headingAlignClass,
  sectionPadClass,
} from '@/src/designs/chrome';
import clsx from 'clsx';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 3600;
export const dynamic = 'force-static';

export async function generateStaticParams() {
  try {
    const sites = await getAllActiveSites();
    return sites.map((site) => ({ slug: site.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return {};

  const home = parseJson<HomeContent>(site.homeContent, {});
  if (!home.seo?.title || !home.seo?.metaDescription) return {};

  return buildPageMetadata({
    site,
    title: home.seo.title,
    description: home.seo.metaDescription,
    pathParts: [site.slug],
  });
}

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function slugifyService(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function hashString(value: string): number {
  return value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function getNearbyAreas(city: string, state: string): string[] {
  const njAreas = [
    'Newark',
    'Jersey City',
    'Paterson',
    'Elizabeth',
    'Edison',
    'Woodbridge',
    'Lakewood',
    'Toms River',
    'Hamilton',
    'Trenton',
  ];
  const normalizedState = state.trim().toLowerCase();
  if (normalizedState === 'nj' || normalizedState === 'new jersey') {
    return njAreas.filter((area) => area.toLowerCase() !== city.toLowerCase()).slice(0, 6);
  }
  return [
    `Greater ${city}`,
    `North ${city}`,
    `South ${city}`,
    `East ${city}`,
    `West ${city}`,
    `${state} Metro`,
  ];
}

function buildTrustBadges(city: string, industry: string) {
  const badges = [
    {
      icon: 'dollar-sign',
      title: 'Free Estimates',
      subtitle: 'No-obligation, upfront quotes',
    },
    {
      icon: 'thumbs-up',
      title: 'Satisfaction Guaranteed',
      subtitle: 'We stand behind our work',
    },
    {
      icon: 'home',
      title: 'Locally Owned',
      subtitle: `Proudly serving ${city}`,
    },
  ];

  if (industryRequiresLicense(industry)) {
    badges.unshift({
      icon: 'shield',
      title: 'Licensed & Insured',
      subtitle: 'Fully certified professionals',
    });
  } else {
    badges.unshift({
      icon: 'shield',
      title: 'Trusted Local Pros',
      subtitle: 'Reliable service you can count on',
    });
  }

  return badges;
}

function buildFaqs(
  businessName: string,
  city: string,
  state: string,
  industry: string,
  phone: string | null | undefined,
): { question: string; answer: string }[] {
  const contactSentence = phone
    ? `Call us at ${phone}`
    : 'Reach out through our contact page';

  const faqs = [
    {
      question: `What areas does ${businessName} serve?`,
      answer: `${businessName} proudly serves ${city}, ${state} and the surrounding communities. If you're nearby and aren't sure whether we cover your area, just give us a call and we'll be glad to help.`,
    },
    {
      question: 'How do I request a quote or schedule service?',
      answer: `Getting started is simple. ${contactSentence} or fill out the contact form on our website, and we'll respond promptly to discuss your needs and find a time that works for you.`,
    },
    {
      question: 'Do you offer free estimates?',
      answer: `Absolutely. We provide free, no-obligation estimates for your ${industry} needs in ${city}. You'll get clear, upfront pricing with no hidden fees before any work begins.`,
    },
    {
      question: `What makes ${businessName} different from other ${industry} providers?`,
      answer: `As a locally owned business in ${city}, we pair professional expertise with genuine, personal customer care. We treat every customer like a neighbor and take real pride in the quality of our work.`,
    },
  ];

  if (industryRequiresLicense(industry)) {
    faqs.splice(2, 0, {
      question: `Is ${businessName} licensed and insured?`,
      answer: `Yes. ${businessName} maintains the licensing and insurance expected for ${industry} work, so you can have peace of mind knowing your project is handled by qualified professionals.`,
    });
  }

  return faqs;
}

function buildTestimonials(businessName: string, city: string, industry: string) {
  const names = ['Michael R.', 'Sarah T.', 'David K.'];
  const reviews = [
    `${businessName} exceeded our expectations. Their ${industry} team was professional, on time, and left everything spotless. We will definitely use them again in ${city}.`,
    `We called ${businessName} for help and they responded quickly. Fair pricing, honest advice, and quality work — exactly what you want from a local ${city} business.`,
    `Outstanding service from start to finish. ${businessName} explained every step clearly and delivered great results. Highly recommend to anyone in ${city} and nearby areas.`,
  ];
  return names.map((name, i) => ({ name, review: reviews[i]! }));
}

const processSteps = [
  {
    title: 'Contact Us',
    description: 'Reach out by phone or our contact form. We respond quickly and schedule a convenient time.',
  },
  {
    title: 'We Assess Your Needs',
    description: 'Our team evaluates your situation, answers questions, and provides a clear plan tailored to you.',
  },
  {
    title: 'We Deliver Results',
    description: 'We complete the work on schedule with quality you can count on and follow up to ensure satisfaction.',
  },
];


function getLocationExcerpt(content: string | null | undefined): string {
  if (!content) return '';
  try {
    const parsed = JSON.parse(content) as {
      heroSubheading?: string;
      localIntro?: string;
    };
    if (parsed.heroSubheading?.trim()) return parsed.heroSubheading.trim();
    const intro = parsed.localIntro?.trim() ?? '';
    if (intro.length <= 140) return intro;
    return `${intro.slice(0, 137).trimEnd()}...`;
  } catch {
    return '';
  }
}

export default async function HomePage({ params }: PageProps) {
  const { slug } = await params;
  const [site, images, locations] = await Promise.all([
    getSiteBySlug(slug),
    getSiteImages(slug),
    getLocationPages(slug),
  ]);
  if (!site) notFound();
  const content = parseJson<HomeContent>(site.homeContent, {});
  const theme = resolveTheme(site);
  const accentOnWhite = getAccessibleForeground(theme.accentColor, '#FFFFFF');
  const accentOnSecondary = getAccessibleForeground(theme.accentColor, theme.secondaryColor);
  const hero = content.hero ?? {};
  const about = content.about ?? {};
  const services = content.services ?? [];
  const homeServices = services.length > 6 ? services.slice(0, 6) : services;
  const whyChooseUs = content.whyChooseUs ?? [];
  const cta = content.cta ?? {};
  const design = resolveDesignPreset(site.designVariant);
  const recipe = getDesignRecipe(site.designVariant);
  const sectionOrder = homeSectionFlexOrder(recipe.sectionOrder);
  const serviceCount = services.length;
  const nearbyAreas = getNearbyAreas(site.city, site.state);
  const testimonials = buildTestimonials(site.businessName, site.city, site.industry);
  const trustBadges = buildTrustBadges(site.city, site.industry);
  const faqs = buildFaqs(site.businessName, site.city, site.state, site.industry, site.phone);

  const stats: Array<{ value: string; label: string; showStar?: boolean }> = [];
  if (site.yearsInBusiness?.trim()) {
    stats.push({ value: site.yearsInBusiness.trim(), label: 'Years in Business' });
  }
  if (site.customersServed?.trim()) {
    stats.push({ value: site.customersServed.trim(), label: 'Customers Served' });
  }
  if (site.projectsCompleted?.trim()) {
    stats.push({ value: site.projectsCompleted.trim(), label: 'Projects Completed' });
  }
  if (serviceCount > 0) {
    stats.push({ value: String(serviceCount), label: 'Services Offered' });
  }
  stats.push({ value: site.city, label: 'Primary Service Area' });

  return (
    <>
      <FamilyHero
        site={site}
        theme={theme}
        design={design}
        slug={slug}
        heading={hero.heading || `Welcome to ${site.businessName}`}
        subheading={hero.subheading || `Serving ${site.city}, ${site.state} with pride.`}
        ctaButton={hero.ctaButton || 'Get Started'}
        heroImage={images.hero}
      />

      <div className="flex flex-col">
      {/* Skip classic trust strip on editorial/utility — different rhythm */}
      {design.family !== 'editorial' && design.family !== 'utility' ? (
      <div style={{ order: sectionOrder.trust }}>
      <SectionWrapper
        background={design.family === 'bold' ? theme.primaryColor : '#fff'}
        className={sectionPadClass(design)}
        style={{ borderBottom: `1px solid ${colorWithOpacity(theme.primaryColor, 0.1)}` }}
      >
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {trustBadges.map((badge) => (
            <div
              key={badge.title}
              className="flex flex-col items-center gap-3 text-center md:flex-row md:gap-4 md:text-left"
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    design.family === 'bold'
                      ? 'rgba(255,255,255,0.15)'
                      : colorWithOpacity(theme.accentColor, 0.12),
                  color: design.family === 'bold' ? '#fff' : accentOnWhite,
                }}
              >
                {getIcon(badge.icon, 'w-6 h-6')}
              </span>
              <div>
                <p
                  className="font-bold"
                  style={{ color: design.family === 'bold' ? '#fff' : undefined }}
                >
                  {badge.title}
                </p>
                <p
                  className={
                    design.family === 'bold'
                      ? 'mt-0.5 text-sm text-white/75'
                      : 'mt-0.5 text-sm text-gray-500'
                  }
                >
                  {badge.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      </SectionWrapper>
      </div>
      ) : null}

      <div style={{ order: sectionOrder.about }}>
      <SectionWrapper background={theme.secondaryColor} className={sectionPadClass(design)}>
        <div className="mx-auto max-w-6xl">
          <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-20">
            <div className="order-2 lg:order-1">
              <h2 className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
                {about.heading || `About ${site.businessName}`}
              </h2>
              <div
                className="mt-5 h-1 w-14 rounded-full"
                style={{ backgroundColor: theme.accentColor }}
              />
              <p className="mt-8 text-base leading-8 text-gray-600 md:text-lg md:leading-8">
                {about.paragraph1 || site.description}
              </p>

              {/* <ul className="mt-8 space-y-3">
                {trustBadges.slice(0, 3).map((badge) => (
                  <li key={badge.title} className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0" style={{ color: theme.accentColor }}>
                      {getIcon(badge.icon, 'w-5 h-5')}
                    </span>
                    <span className="text-sm font-medium text-gray-700 md:text-base">
                      {badge.title}
                    </span>
                  </li>
                ))}
              </ul> */}

              <Link
                href={`/${slug}/about`}
                className="mt-10 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold shadow-md transition hover:opacity-90"
                style={{
                  backgroundColor: theme.primaryColor,
                  color: getTextColor(theme.primaryColor),
                }}
              >
                Read Our Full Story
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="order-1 lg:order-2 lg:pt-2">
              <div className="relative mx-auto w-full max-w-md lg:ml-auto lg:max-w-none">
                <div
                  className="absolute -bottom-4 -left-4 h-full w-full"
                  style={{
                    backgroundColor: colorWithOpacity(theme.accentColor, 0.25),
                    borderRadius: 'var(--design-card-radius)',
                  }}
                  aria-hidden
                />
                <div
                  className="relative aspect-[5/4] overflow-hidden shadow-xl"
                  style={{ borderRadius: 'var(--design-card-radius)' }}
                >
                  {images.about ? (
                    <SiteImage
                      src={images.about}
                      alt={`About ${site.businessName}`}
                      fill
                      className="object-cover object-center"
                      sizes="(max-width: 1024px) 90vw, 45vw"
                      fallback={
                        <div
                          className="h-full w-full"
                          style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.12) }}
                        />
                      }
                    />
                  ) : (
                    <div
                      className="h-full w-full"
                      style={{ backgroundColor: colorWithOpacity(theme.accentColor, 0.12) }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionWrapper>
      </div>

      <div style={{ order: sectionOrder.services }}>
      <SectionWrapper background="#fff" className={sectionPadClass(design)}>
        <div className="mx-auto max-w-6xl">
          <div className={clsx('mb-12', headingAlignClass(design))}>
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">Our Services</h2>
            <div
              className={clsx(
                'mt-4 h-1 w-14 rounded-full',
                headingAlignClass(design) === 'text-center' && 'mx-auto',
              )}
              style={{ backgroundColor: theme.accentColor }}
            />
          </div>
        <div className={servicesGridClass(design.servicesLayout)}>
          {homeServices.map((service, i) => {
            const serviceSlug = slugifyService(service.title || `service-${i}`);
            const isListLayout =
              design.servicesLayout === 'listRows' || design.servicesLayout === 'iconLeft';

            return (
              <Link
                key={`${service.title}-${i}`}
                href={`/${slug}/services/${serviceSlug}`}
                className={clsx(
                  'group overflow-hidden bg-white transition duration-300 hover:-translate-y-1',
                  isListLayout
                    ? 'flex flex-col sm:flex-row sm:items-stretch'
                    : 'flex flex-col',
                )}
                style={{
                  borderTop: isListLayout ? undefined : `4px solid ${theme.accentColor}`,
                  borderLeft: isListLayout ? `4px solid ${theme.accentColor}` : undefined,
                  borderRadius: 'var(--design-card-radius)',
                  boxShadow: 'var(--design-card-shadow)',
                  border: 'var(--design-card-border)',
                }}
              >
                {images.services[i] ? (
                  <div
                    className={clsx(
                      'relative shrink-0 overflow-hidden',
                      isListLayout
                        ? 'aspect-[16/10] w-full sm:aspect-auto sm:h-auto sm:w-56 md:w-64 lg:w-72'
                        : design.servicesLayout === 'megaTiles'
                          ? 'aspect-[16/10] w-full'
                          : 'aspect-[4/3] w-full',
                    )}
                  >
                    <SiteImage
                      src={images.services[i]!}
                      alt={`${service.title} service`}
                      fill
                      className="object-cover object-center transition duration-300 group-hover:scale-105"
                      sizes={
                        isListLayout
                          ? '(max-width: 640px) 100vw, 288px'
                          : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
                      }
                      fallback={
                        <div
                          className="flex h-full items-center justify-center"
                          style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.2) }}
                        >
                          <span style={{ color: accentOnWhite }}>
                            {getIcon(service.icon || 'wrench', 'w-8 h-8')}
                          </span>
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <div
                    className={clsx(
                      'flex shrink-0 items-center justify-center',
                      isListLayout ? 'h-28 w-full sm:h-auto sm:w-56 md:w-64' : 'aspect-[4/3] w-full',
                    )}
                    style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.2) }}
                  >
                    <span style={{ color: accentOnWhite }}>
                      {getIcon(service.icon || 'wrench', 'w-8 h-8')}
                    </span>
                  </div>
                )}
                <div
                  className={clsx(
                    'flex flex-1 flex-col px-6 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6',
                    isListLayout && 'justify-center',
                  )}
                >
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:underline">
                    {service.title}
                  </h3>
                  <p className="mt-3 flex-1 text-gray-600">{service.description}</p>
                  <span
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold underline decoration-2 underline-offset-2"
                    style={{ color: accentOnWhite }}
                  >
                    Learn More <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-12 text-center">
          <Link
            href={`/${slug}/services`}
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 px-8 py-3 text-sm font-semibold transition hover:opacity-80"
            style={{ borderColor: theme.accentColor, color: accentOnWhite }}
          >
            View All Services <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        </div>
      </SectionWrapper>
      </div>

      <div style={{ order: sectionOrder.why }}>
      <SectionWrapper background="#fff" className={sectionPadClass(design)}>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Why Choose Us</h2>
            <p className="mt-4 text-lg text-gray-600">
              {site.businessName} delivers dependable {site.industry} service with a personal touch.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {whyChooseUs.map((item, i) => (
              <div
                key={`${item.point}-${i}`}
                className="bg-white p-6"
                style={cardChromeStyle()}
              >
                <div className="flex items-start gap-3">
                  <span className="shrink-0" style={{ color: accentOnWhite }}>
                    {getIcon('check-circle', 'w-5 h-5')}
                  </span>
                  <div>
                    <p className="font-bold text-gray-900">{item.point}</p>
                    <p className="mt-2 text-sm text-gray-600">{item.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionWrapper>
      </div>

      {stats.length > 0 ? (
      <div style={{ order: sectionOrder.stats }}>
      <SectionWrapper
        background={design.sectionRhythm === 'boldBands' ? theme.secondaryColor : '#fff'}
        className={sectionPadClass(design)}
      >
        <div
          className={clsx(
            'grid overflow-hidden border border-gray-200',
            stats.length >= 4
              ? 'grid-cols-2 divide-x divide-y divide-gray-200 md:grid-cols-4 md:divide-y-0'
              : stats.length === 3
                ? 'grid-cols-1 divide-y divide-gray-200 md:grid-cols-3 md:divide-x md:divide-y-0'
                : 'grid-cols-1 divide-y divide-gray-200 md:grid-cols-2 md:divide-x md:divide-y-0',
          )}
          style={{ borderRadius: 'var(--design-card-radius)' }}
        >
          {stats.map((stat, i) => (
            <div
              key={`${stat.label}-${i}`}
              className="flex flex-col items-center justify-center px-4 py-10 text-center md:py-12"
            >
              <div className="flex items-center gap-1">
                <span
                  className="text-4xl font-bold md:text-5xl"
                  style={{ color: theme.primaryColor }}
                >
                  {stat.value}
                </span>
                {stat.showStar ? (
                  <Star
                    className="h-7 w-7 fill-current"
                    style={{ color: theme.primaryColor }}
                  />
                ) : null}
              </div>
              <p className="mt-3 text-sm font-medium text-gray-500 md:text-base">{stat.label}</p>
            </div>
          ))}
        </div>
      </SectionWrapper>
      </div>
      ) : null}

      <div style={{ order: sectionOrder.process }}>
      <SectionWrapper background={theme.secondaryColor} className={sectionPadClass(design)}>
        <div className={clsx('mb-12', headingAlignClass(design))}>
          <h2 className="text-3xl font-bold text-gray-900">How It Works</h2>
          <p className="mt-3 text-lg text-gray-600">Our simple three-step process</p>
        </div>
        <div className="grid gap-10 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start md:gap-6">
          {processSteps.map((step, i) => (
            <div key={step.title} className="contents">
              <div className="flex flex-col items-center text-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white"
                  style={{ backgroundColor: theme.accentColor }}
                >
                  {i + 1}
                </div>
                <h3 className="mt-5 text-xl font-bold text-gray-900">{step.title}</h3>
                <p className="mt-3 max-w-xs text-gray-600">{step.description}</p>
              </div>
              {i < processSteps.length - 1 ? (
                <div className="hidden items-center justify-center md:flex">
                  <ArrowRight className="h-8 w-8 text-gray-400" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionWrapper>
      </div>

      <div style={{ order: sectionOrder.reviews }}>
      <SectionWrapper background="#fff" className={sectionPadClass(design)}>
        <div className={clsx('mb-12', headingAlignClass(design))}>
          <h2 className="text-3xl font-bold text-gray-900">What Our Customers Say</h2>
          <p className="mt-3 text-lg text-gray-600">
            Trusted by homeowners and businesses across {site.city}
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <article
              key={testimonial.name}
              className="relative bg-white p-8"
              style={cardChromeStyle()}
            >
              <Quote
                className="mb-4 h-8 w-8"
                style={{ color: accentOnWhite }}
              />
              <div className="mb-4 flex gap-1">
                {Array.from({ length: 5 }).map((_, starIndex) => (
                  <Star
                    key={starIndex}
                    className="h-4 w-4 fill-current text-amber-400"
                  />
                ))}
              </div>
              <p className="leading-relaxed text-gray-600">{testimonial.review}</p>
              <p className="mt-6 font-semibold text-gray-900">{testimonial.name}</p>
            </article>
          ))}
        </div>
      </SectionWrapper>
      </div>

      <div style={{ order: sectionOrder.locations }}>
      <SectionWrapper background={theme.secondaryColor} className={sectionPadClass(design)}>
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p
                className="text-sm font-semibold uppercase tracking-widest"
                style={{ color: accentOnSecondary }}
              >
              </p>
              <h2 className="mt-3 text-3xl font-bold text-gray-900 md:text-4xl">
                {locations.length > 0
                  ? `Areas We Serve Near ${site.city}`
                  : `Serving ${site.city} and Surrounding Areas`}
              </h2>
              <div
                className="mt-5 h-1 w-16 rounded-full"
                style={{ backgroundColor: theme.accentColor }}
              />
            </div>
            <p className="max-w-lg text-base leading-relaxed text-gray-600 lg:text-right">
              {locations.length > 0
                ? `${site.businessName} proudly serves ${site.city} and neighboring communities across ${site.state}. Choose your area to see local services and coverage details.`
                : `${site.businessName} is proud to serve ${site.city}, ${site.state} and the surrounding communities.`}
            </p>
          </div>

          {locations.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {locations.map((location) => {
                const excerpt =
                  getLocationExcerpt(location.content) ||
                  `${site.industry} services in ${location.city}, ${location.state}`;

                return (
                  <Link
                    key={location.id}
                    href={`/${slug}/${location.slug}`}
                    className="group overflow-hidden bg-white transition duration-300 hover:-translate-y-1"
                    style={cardChromeStyle()}
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden">
                      {location.imageUrl ? (
                        <SiteImage
                          src={location.imageUrl}
                          alt={`${site.businessName} in ${location.city}`}
                          fill
                          className="object-cover transition duration-500 group-hover:scale-105"
                          sizes="(max-width: 640px) 100vw, 33vw"
                          fallback={
                            <div
                              className="flex h-full items-center justify-center"
                              style={{
                                backgroundColor: colorWithOpacity(theme.accentColor, 0.1),
                              }}
                            >
                              <MapPin className="h-8 w-8" style={{ color: accentOnWhite }} />
                            </div>
                          }
                        />
                      ) : (
                        <div
                          className="flex h-full items-center justify-center"
                          style={{ backgroundColor: colorWithOpacity(theme.accentColor, 0.1) }}
                        >
                          <MapPin className="h-8 w-8" style={{ color: accentOnWhite }} />
                        </div>
                      )}
                      <div
                        className="absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
                        style={{
                          background: `linear-gradient(to top, ${colorWithOpacity(theme.primaryColor, 0.65)}, transparent 60%)`,
                        }}
                      />
                    </div>
                    <div className="p-5">
                      <h3 className="text-xl font-bold text-gray-900 group-hover:underline">
                        {location.city}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">{location.state}</p>
                      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
                        {excerpt}
                      </p>
                      <span
                        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold underline decoration-2 underline-offset-2 transition group-hover:gap-3"
                        style={{ color: accentOnWhite }}
                      >
                        Explore {location.city}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {nearbyAreas.map((area) => (
                <span
                  key={area}
                  className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  {area}
                </span>
              ))}
            </div>
          )}
        </div>
      </SectionWrapper>
      </div>

      <FAQSchema faqs={faqs} />
      <div style={{ order: sectionOrder.faq }}>
      <SectionWrapper background="#fff" className={sectionPadClass(design)}>
        <div className="mx-auto max-w-3xl">
          <div className={clsx('mb-12', headingAlignClass(design))}>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
            <p className="mt-3 text-lg text-gray-600">
              Everything you need to know about working with {site.businessName}
            </p>
          </div>
          <div className="mt-2">
            <FaqAccordion faqs={faqs} accentColor={theme.accentColor} />
          </div>
        </div>
      </SectionWrapper>
      </div>
      </div>

      <SeoContentSection
        site={site}
        seoExtra={content.seoExtra}
        showFaqs={false}
        currentPath=""
        relatedLinks={serviceRelatedLinks(homeServices, { limit: 3 })}
      />

      <CtaBanner
        site={site}
        heading={cta.heading || `Ready to work with ${site.businessName}?`}
        subtext={cta.subtext}
        buttonText={cta.buttonText}
      />
      <LocalBusinessSchema site={site} imageUrl={images.hero} />
      <WebSiteSchema site={site} />
    </>
  );
}
