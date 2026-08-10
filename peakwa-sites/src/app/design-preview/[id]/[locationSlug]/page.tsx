import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, MapPin, Users } from 'lucide-react';
import clsx from 'clsx';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { CtaBanner } from '@/src/components/CtaBanner';
import { FaqAccordion } from '@/src/components/FaqAccordion';
import { HeroBanner } from '@/src/components/HeroBanner';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { getDesignRecipe } from '@/src/designs/catalog';
import {
  cardChromeStyle,
  headingAlignClass,
  sectionPadClass,
} from '@/src/designs/chrome';
import { DESIGN_PREVIEW_LOCATIONS } from '@/src/lib/designPreviewSample';
import { getPreviewContext } from '@/src/lib/designPreviewUtils';
import { parseJson } from '@/src/lib/content';

type LocationPageContent = {
  heroHeading?: string;
  heroSubheading?: string;
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
  cta?: { heading?: string; buttonText?: string };
};

type PageProps = { params: Promise<{ id: string; locationSlug: string }> };

export function generateStaticParams() {
  const params: Array<{ id: string; locationSlug: string }> = [];
  for (let i = 1; i <= 50; i++) {
    for (const loc of DESIGN_PREVIEW_LOCATIONS) {
      params.push({ id: String(i), locationSlug: loc.slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, locationSlug } = await params;
  const recipe = getDesignRecipe(Number(id));
  const loc = DESIGN_PREVIEW_LOCATIONS.find((l) => l.slug === locationSlug);
  return {
    title: `${loc?.city ?? locationSlug} · Preview ${recipe.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function DesignPreviewLocationPage({ params }: PageProps) {
  const { id, locationSlug } = await params;
  const { site, theme, design } = getPreviewContext(id);
  const location = DESIGN_PREVIEW_LOCATIONS.find((l) => l.slug === locationSlug);
  if (!location) notFound();

  const content = parseJson<LocationPageContent>(location.content, {});
  const pad = sectionPadClass(design);

  const stats = [
    {
      icon: Clock,
      label: 'Years Serving',
      value: site.yearsInBusiness || content.localStats?.yearsServing || '12',
    },
    {
      icon: Users,
      label: 'Customers Served',
      value: site.customersServed || content.localStats?.customersServed || '2,400+',
    },
    {
      icon: MapPin,
      label: 'Response',
      value: content.localStats?.responseTime || 'Same-week',
    },
  ];

  return (
    <>
      <HeroBanner
        site={site}
        heroImage={location.imageUrl}
        title={content.heroHeading || `${site.businessName} in ${location.city}`}
        subtitle={
          content.heroSubheading ||
          `Trusted ${site.industry.toLowerCase()} in ${location.city}, ${location.state}`
        }
        compact={design.heroLayout === 'compact' || design.family === 'utility'}
      >
        <Breadcrumbs site={site} items={[{ label: location.city }]} />
      </HeroBanner>

      <SectionWrapper background="#fff" className={pad}>
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-gray-900">Serving {location.city}</h2>
          <p className="mt-5 text-lg leading-8 text-gray-600">{content.localIntro}</p>
        </div>
      </SectionWrapper>

      <SectionWrapper background={theme.secondaryColor} className={pad}>
        <div className="grid gap-6 sm:grid-cols-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-white p-6 text-center" style={cardChromeStyle()}>
                <Icon className="mx-auto h-6 w-6" style={{ color: theme.accentColor }} />
                <p className="mt-3 text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="mt-1 text-sm text-gray-500">{stat.label}</p>
              </div>
            );
          })}
        </div>
      </SectionWrapper>

      <SectionWrapper background="#fff" className={pad}>
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-gray-900">Why Local Matters</h2>
          <p className="mt-5 text-lg leading-8 text-gray-600">{content.whyLocal}</p>
        </div>
      </SectionWrapper>

      <SectionWrapper background={theme.secondaryColor} className={pad}>
        <div className={clsx('mb-10', headingAlignClass(design))}>
          <h2 className="text-3xl font-bold text-gray-900">How We Serve {location.city}</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {(content.process ?? []).map((step, i) => (
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
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-gray-900">Service Area</h2>
          <p className="mt-5 text-lg leading-8 text-gray-600">{content.serviceArea}</p>
          <Link
            href={`/${site.slug}/contact`}
            className="mt-8 inline-flex rounded-full px-6 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: theme.accentColor }}
          >
            Request service in {location.city}
          </Link>
        </div>
      </SectionWrapper>

      {(content.faqs?.length ?? 0) > 0 ? (
        <SectionWrapper background={theme.secondaryColor} className={pad}>
          <div className="mx-auto max-w-3xl">
            <div className={clsx('mb-8', headingAlignClass(design))}>
              <h2 className="text-3xl font-bold text-gray-900">FAQs for {location.city}</h2>
            </div>
            <FaqAccordion
              faqs={(content.faqs ?? []).map((f) => ({
                question: f.question || '',
                answer: f.answer || '',
              }))}
              accentColor={theme.accentColor}
            />
          </div>
        </SectionWrapper>
      ) : null}

      <CtaBanner
        site={site}
        heading={content.cta?.heading || `Need service in ${location.city}?`}
        buttonText={content.cta?.buttonText || 'Contact Us'}
      />
    </>
  );
}
