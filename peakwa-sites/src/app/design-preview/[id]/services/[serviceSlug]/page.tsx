import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Phone } from 'lucide-react';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { CtaBanner } from '@/src/components/CtaBanner';
import { FaqAccordion } from '@/src/components/FaqAccordion';
import { HeroBanner } from '@/src/components/HeroBanner';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getDesignRecipe } from '@/src/designs/catalog';
import {
  cardChromeStyle,
  headingAlignClass,
  sectionPadClass,
} from '@/src/designs/chrome';
import {
  DESIGN_PREVIEW_IMAGES,
  DESIGN_PREVIEW_SERVICE_DETAIL,
  DESIGN_PREVIEW_SERVICES,
} from '@/src/lib/designPreviewSample';
import { getPreviewContext, slugifyService } from '@/src/lib/designPreviewUtils';
import { getTextColor } from '@/src/lib/theme';
import clsx from 'clsx';

type PageProps = { params: Promise<{ id: string; serviceSlug: string }> };

export function generateStaticParams() {
  const services = DESIGN_PREVIEW_SERVICES.services ?? [];
  const params: Array<{ id: string; serviceSlug: string }> = [];
  for (let i = 1; i <= 50; i++) {
    for (const service of services) {
      params.push({
        id: String(i),
        serviceSlug: slugifyService(service.title || 'service'),
      });
    }
  }
  return params;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, serviceSlug } = await params;
  const recipe = getDesignRecipe(Number(id));
  return {
    title: `${serviceSlug} · Preview ${recipe.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function DesignPreviewServiceDetailPage({ params }: PageProps) {
  const { id, serviceSlug } = await params;
  const { site, theme, design } = getPreviewContext(id);
  const services = DESIGN_PREVIEW_SERVICES.services ?? [];
  const serviceIndex = services.findIndex(
    (s) => slugifyService(s.title || '') === serviceSlug,
  );
  const service = serviceIndex >= 0 ? services[serviceIndex] : null;
  if (!service) notFound();

  const detail = DESIGN_PREVIEW_SERVICE_DETAIL;
  const image = DESIGN_PREVIEW_IMAGES.services[serviceIndex] || DESIGN_PREVIEW_IMAGES.hero;
  const otherServices = services.filter((_, i) => i !== serviceIndex).slice(0, 3);
  const pad = sectionPadClass(design);

  return (
    <>
      <HeroBanner
        site={site}
        heroImage={image}
        title={service.title || 'Service'}
        subtitle={service.shortDescription}
        compact={design.heroLayout === 'compact' || design.family === 'utility'}
      >
        <Breadcrumbs
          site={site}
          items={[
            { label: 'Services', href: `/${site.slug}/services` },
            { label: service.title || 'Service' },
          ]}
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/${site.slug}/contact`}
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-bold text-white"
            style={{
              backgroundColor: theme.accentColor,
              color: getTextColor(theme.accentColor),
              borderRadius: 'var(--design-button-radius)',
            }}
          >
            Request a quote
          </Link>
          {site.phone ? (
            <a
              href={`tel:${site.phone}`}
              className="inline-flex items-center gap-2 border-2 border-white px-6 py-3 text-sm font-semibold text-white"
              style={{ borderRadius: 'var(--design-button-radius)' }}
            >
              <Phone className="h-4 w-4" />
              {site.phone}
            </a>
          ) : null}
        </div>
      </HeroBanner>

      <SectionWrapper background="#fff" className={pad}>
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Overview</h2>
            <p className="mt-5 text-lg leading-8 text-gray-600">
              {service.fullDescription || detail.overview}
            </p>
            <p className="mt-4 text-lg leading-8 text-gray-600">{detail.overview}</p>
          </div>
          <div
            className="relative aspect-[4/3] overflow-hidden shadow-xl"
            style={{ borderRadius: 'var(--design-card-radius)' }}
          >
            <SiteImage src={image} alt={service.title || 'Service'} fill className="object-cover" sizes="50vw" />
          </div>
        </div>
      </SectionWrapper>

      <SectionWrapper background={theme.secondaryColor} className={pad}>
        <div className={clsx('mb-10', headingAlignClass(design))}>
          <h2 className="text-3xl font-bold text-gray-900">How It Works</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {detail.process.map((step, i) => (
            <div key={step.step} className="bg-white p-6" style={cardChromeStyle()}>
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: theme.accentColor }}
              >
                {i + 1}
              </div>
              <h3 className="mt-4 text-lg font-bold text-gray-900">{step.step}</h3>
              <p className="mt-2 text-gray-600">{step.description}</p>
            </div>
          ))}
        </div>
      </SectionWrapper>

      <SectionWrapper background="#fff" className={pad}>
        <div className={clsx('mb-10', headingAlignClass(design))}>
          <h2 className="text-3xl font-bold text-gray-900">Benefits</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {detail.benefits.map((benefit) => (
            <div key={benefit.title} className="bg-white p-6" style={cardChromeStyle()}>
              <h3 className="text-lg font-bold text-gray-900">{benefit.title}</h3>
              <p className="mt-2 text-gray-600">{benefit.description}</p>
            </div>
          ))}
        </div>
      </SectionWrapper>

      <SectionWrapper background={theme.secondaryColor} className={pad}>
        <div className="mx-auto max-w-3xl">
          <div className={clsx('mb-8', headingAlignClass(design))}>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <FaqAccordion faqs={detail.faqs} accentColor={theme.accentColor} />
        </div>
      </SectionWrapper>

      <SectionWrapper background="#fff" className={pad}>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-gray-900">Why Choose Us</h2>
          <p className="mt-5 text-lg leading-8 text-gray-600">{detail.whyUs}</p>
        </div>
      </SectionWrapper>

      {otherServices.length > 0 ? (
        <SectionWrapper background={theme.secondaryColor} className={pad}>
          <div className={clsx('mb-8', headingAlignClass(design))}>
            <h2 className="text-3xl font-bold text-gray-900">Other Services</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {otherServices.map((item) => (
              <Link
                key={item.title}
                href={`/${site.slug}/services/${slugifyService(item.title || '')}`}
                className="bg-white p-6 transition hover:-translate-y-0.5"
                style={cardChromeStyle()}
              >
                <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{item.shortDescription}</p>
              </Link>
            ))}
          </div>
        </SectionWrapper>
      ) : null}

      <CtaBanner
        site={site}
        heading={`Ready for ${service.title}?`}
        subtext="Request a visit and we’ll confirm timing within one business day."
        buttonText="Contact Us"
      />
    </>
  );
}
