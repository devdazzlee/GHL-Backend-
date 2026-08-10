import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ChevronDown, MapPin, Quote, Star } from 'lucide-react';
import clsx from 'clsx';
import { CtaBanner } from '@/src/components/CtaBanner';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getDesignRecipe } from '@/src/designs/catalog';
import { FamilyHero } from '@/src/designs/FamilyHero';
import {
  cardChromeStyle,
  headingAlignClass,
  sectionPadClass,
} from '@/src/designs/chrome';
import { resolveDesignPreset, servicesGridClass } from '@/src/designs/presets';
import { homeSectionFlexOrder } from '@/src/designs/sectionOrder';
import { getIcon } from '@/src/lib/iconMap';
import {
  buildDesignPreviewSite,
  DESIGN_PREVIEW_HOME,
  DESIGN_PREVIEW_IMAGES,
  DESIGN_PREVIEW_LOCATIONS,
} from '@/src/lib/designPreviewSample';
import { getAccessibleForeground, getTextColor, hexToRgb, resolveTheme } from '@/src/lib/theme';
import { parsePreviewDesignId } from '@/src/lib/designPreviewUtils';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-static';
export const revalidate = false;

export function generateStaticParams() {
  return Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const designId = Number(id);
  if (!Number.isFinite(designId) || designId < 1 || designId > 50) {
    return { title: 'Design Preview', robots: { index: false, follow: false } };
  }
  const recipe = getDesignRecipe(designId);
  return {
    title: `Preview · ${recipe.name} (#${recipe.id})`,
    description: recipe.description,
    robots: { index: false, follow: false },
  };
}

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const faqs = [
  {
    question: 'How quickly can you schedule a visit?',
    answer:
      'Most Austin-area jobs are scheduled within 2–3 business days. Urgent requests are prioritized when capacity allows.',
  },
  {
    question: 'Do you provide written estimates?',
    answer:
      'Yes. You’ll receive a clear estimate before work begins so you know exactly what to expect.',
  },
  {
    question: 'Are your technicians background-checked?',
    answer:
      'Every Summit technician completes screening and ongoing training before working in customer homes.',
  },
];

const testimonials = [
  {
    name: 'Jordan M.',
    review:
      'Summit showed up on time, explained the options, and finished cleanly. Exactly the local team we wanted.',
  },
  {
    name: 'Priya S.',
    review:
      'Fair pricing and excellent communication. They fixed our plumbing issue the same week we called.',
  },
  {
    name: 'Chris L.',
    review:
      'Professional from quote to follow-up. We’ll use Summit again for our next home project.',
  },
];

export default async function DesignPreviewPage({ params }: PageProps) {
  const { id } = await params;
  const designId = parsePreviewDesignId(id);

  const site = buildDesignPreviewSite(designId);
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(designId);
  const recipe = getDesignRecipe(designId);
  const sectionOrder = homeSectionFlexOrder(recipe.sectionOrder);
  const content = DESIGN_PREVIEW_HOME;
  const hero = content.hero ?? {};
  const about = content.about ?? {};
  const services = content.services ?? [];
  const whyChooseUs = content.whyChooseUs ?? [];
  const cta = content.cta ?? {};
  const images = DESIGN_PREVIEW_IMAGES;
  const locations = DESIGN_PREVIEW_LOCATIONS;
  const accentOnWhite = getAccessibleForeground(theme.accentColor, '#FFFFFF');
  const accentOnSecondary = getAccessibleForeground(theme.accentColor, theme.secondaryColor);

  const stats = [
    { value: site.yearsInBusiness!, label: 'Years in Business' },
    { value: site.customersServed!, label: 'Customers Served' },
    { value: site.projectsCompleted!, label: 'Projects Completed' },
    { value: String(services.length), label: 'Services Offered' },
  ];

  const trustBadges = [
    { icon: 'shield', title: 'Licensed Pros', subtitle: 'Trained local technicians' },
    { icon: 'clock', title: 'On-Time Arrival', subtitle: 'Respect for your schedule' },
    { icon: 'star', title: '5-Star Care', subtitle: 'Neighbors recommend us' },
    { icon: 'map-pin', title: 'Austin Local', subtitle: 'Serving Central Texas' },
  ];

  return (
    <>
      <FamilyHero
        site={site}
        theme={theme}
        design={design}
        slug={site.slug}
        heading={hero.heading || `Welcome to ${site.businessName}`}
        subheading={hero.subheading || ''}
        ctaButton={hero.ctaButton || 'Get Started'}
        heroImage={images.hero}
      />

      <div className="flex flex-col">
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
            <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-2 lg:gap-20">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
                  {about.heading || `About ${site.businessName}`}
                </h2>
                <div
                  className="mt-5 h-1 w-14 rounded-full"
                  style={{ backgroundColor: theme.accentColor }}
                />
                <p className="mt-8 text-base leading-8 text-gray-600 md:text-lg">
                  {about.paragraph1}
                </p>
              </div>
              <div className="relative aspect-[5/4] overflow-hidden shadow-xl" style={{ borderRadius: 'var(--design-card-radius)' }}>
                <SiteImage
                  src={images.about}
                  alt="About preview"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 90vw, 45vw"
                />
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
                {services.map((service, i) => {
                  const isListLayout =
                    design.servicesLayout === 'listRows' || design.servicesLayout === 'iconLeft';
                  return (
                    <div
                      key={service.title}
                      className={clsx(
                        'overflow-hidden bg-white',
                        isListLayout ? 'flex flex-col sm:flex-row' : 'flex flex-col',
                      )}
                      style={{
                        borderRadius: 'var(--design-card-radius)',
                        boxShadow: 'var(--design-card-shadow)',
                        border: 'var(--design-card-border)',
                        borderTop: isListLayout ? undefined : `4px solid ${theme.accentColor}`,
                        borderLeft: isListLayout ? `4px solid ${theme.accentColor}` : undefined,
                      }}
                    >
                      <div
                        className={clsx(
                          'relative shrink-0 overflow-hidden',
                          isListLayout
                            ? 'aspect-[16/10] w-full sm:aspect-auto sm:w-56'
                            : design.servicesLayout === 'megaTiles'
                              ? 'aspect-[16/10] w-full'
                              : 'aspect-[4/3] w-full',
                        )}
                      >
                        {images.services[i] ? (
                          <SiteImage
                            src={images.services[i]!}
                            alt={service.title || 'Service'}
                            fill
                            className="object-cover"
                            sizes="33vw"
                          />
                        ) : (
                          <div
                            className="flex h-full items-center justify-center"
                            style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.15) }}
                          >
                            {getIcon(service.icon || 'wrench', 'w-8 h-8')}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col px-6 py-5">
                        <h3 className="text-lg font-semibold text-gray-900">{service.title}</h3>
                        <p className="mt-3 text-gray-600">{service.description}</p>
                        <span
                          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold"
                          style={{ color: accentOnWhite }}
                        >
                          Learn More <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  );
                })}
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
                  {site.businessName} delivers dependable {site.industry.toLowerCase()} with a personal touch.
                </p>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                {whyChooseUs.map((item) => (
                  <div key={item.point} className="bg-white p-6" style={cardChromeStyle()}>
                    <p className="font-bold text-gray-900">{item.point}</p>
                    <p className="mt-2 text-sm text-gray-600">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionWrapper>
        </div>

        <div style={{ order: sectionOrder.stats }}>
          <SectionWrapper background="#fff" className={sectionPadClass(design)}>
            <div
              className="grid grid-cols-2 divide-x divide-y divide-gray-200 overflow-hidden border border-gray-200 md:grid-cols-4 md:divide-y-0"
              style={{ borderRadius: 'var(--design-card-radius)' }}
            >
              {stats.map((stat) => (
                <div key={stat.label} className="px-4 py-10 text-center">
                  <p className="text-4xl font-bold" style={{ color: theme.primaryColor }}>
                    {stat.value}
                  </p>
                  <p className="mt-3 text-sm text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </SectionWrapper>
        </div>

        <div style={{ order: sectionOrder.process }}>
          <SectionWrapper background={theme.secondaryColor} className={sectionPadClass(design)}>
            <div className={clsx('mb-12', headingAlignClass(design))}>
              <h2 className="text-3xl font-bold text-gray-900">How It Works</h2>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {['Contact Us', 'We Assess', 'We Deliver'].map((title, i) => (
                <div key={title} className="text-center">
                  <div
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white"
                    style={{ backgroundColor: theme.accentColor, color: getTextColor(theme.accentColor) }}
                  >
                    {i + 1}
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-gray-900">{title}</h3>
                </div>
              ))}
            </div>
          </SectionWrapper>
        </div>

        <div style={{ order: sectionOrder.reviews }}>
          <SectionWrapper background="#fff" className={sectionPadClass(design)}>
            <div className={clsx('mb-12', headingAlignClass(design))}>
              <h2 className="text-3xl font-bold text-gray-900">What Our Customers Say</h2>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {testimonials.map((t) => (
                <article key={t.name} className="bg-white p-8" style={cardChromeStyle()}>
                  <Quote className="mb-4 h-8 w-8" style={{ color: accentOnWhite }} />
                  <div className="mb-4 flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-current text-amber-400" />
                    ))}
                  </div>
                  <p className="text-gray-600">{t.review}</p>
                  <p className="mt-6 font-semibold text-gray-900">{t.name}</p>
                </article>
              ))}
            </div>
          </SectionWrapper>
        </div>

        <div style={{ order: sectionOrder.locations }}>
          <SectionWrapper background={theme.secondaryColor} className={sectionPadClass(design)}>
            <div className="mb-10">
              <h2 className="text-3xl font-bold text-gray-900">Areas We Serve Near {site.city}</h2>
              <div
                className="mt-4 h-1 w-16 rounded-full"
                style={{ backgroundColor: theme.accentColor }}
              />
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {locations.map((location) => (
                <div key={location.id} className="bg-white p-5" style={cardChromeStyle()}>
                  <MapPin className="h-5 w-5" style={{ color: accentOnSecondary }} />
                  <h3 className="mt-3 text-xl font-bold text-gray-900">{location.city}</h3>
                  <p className="text-sm text-gray-500">{location.state}</p>
                </div>
              ))}
            </div>
          </SectionWrapper>
        </div>

        <div style={{ order: sectionOrder.faq }}>
          <SectionWrapper background="#fff" className={sectionPadClass(design)}>
            <div className="mx-auto max-w-3xl">
              <div className={clsx('mb-12', headingAlignClass(design))}>
                <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
              </div>
              <div className="space-y-4">
                {faqs.map((faq) => (
                  <details key={faq.question} className="group bg-white p-6" style={cardChromeStyle()}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                      {faq.question}
                      <ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" />
                    </summary>
                    <p className="mt-4 text-gray-600">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </SectionWrapper>
        </div>
      </div>

      <CtaBanner
        site={site}
        heading={cta.heading || `Ready to work with ${site.businessName}?`}
        subtext={cta.subtext}
        buttonText={cta.buttonText}
      />

      <div className="border-t border-gray-200 bg-white px-4 py-8 text-center">
        <p className="text-sm text-gray-500">
          Previewing design #{design.id} — {design.name}. Apply this layout on any generated site from the dashboard.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {designId > 1 ? (
            <Link
              href={`/design-preview/${designId - 1}`}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Previous design
            </Link>
          ) : null}
          {designId < 50 ? (
            <Link
              href={`/design-preview/${designId + 1}`}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next design →
            </Link>
          ) : null}
        </div>
      </div>

    </>
  );
}
