import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { CtaBanner } from '@/src/components/CtaBanner';
import { HeroBanner } from '@/src/components/HeroBanner';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getDesignRecipe } from '@/src/designs/catalog';
import { servicesGridClass } from '@/src/designs/presets';
import {
  DESIGN_PREVIEW_IMAGES,
  DESIGN_PREVIEW_SERVICES,
} from '@/src/lib/designPreviewSample';
import { getPreviewContext, slugifyService } from '@/src/lib/designPreviewUtils';
import { getIcon } from '@/src/lib/iconMap';
import { hexToRgb } from '@/src/lib/theme';

type PageProps = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = getDesignRecipe(Number(id));
  return {
    title: `Services · Preview ${recipe.name}`,
    robots: { index: false, follow: false },
  };
}

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export default async function DesignPreviewServicesPage({ params }: PageProps) {
  const { id } = await params;
  const { site, theme, design } = getPreviewContext(id);
  const content = DESIGN_PREVIEW_SERVICES;
  const services = content.services ?? [];
  const useGrid =
    design.servicesLayout === 'grid3' ||
    design.servicesLayout === 'grid2' ||
    design.servicesLayout === 'softCards' ||
    design.servicesLayout === 'megaTiles';
  const useList =
    design.servicesLayout === 'listRows' || design.servicesLayout === 'iconLeft';

  return (
    <>
      <HeroBanner
        site={site}
        heroImage={DESIGN_PREVIEW_IMAGES.hero}
        title={content.hero?.heading || 'Our Services'}
        subtitle={content.hero?.subheading}
        compact={design.heroLayout === 'compact' || design.family === 'utility'}
        centered={
          design.heroLayout === 'fullBleedCentered' ||
          design.family === 'editorial' ||
          design.navStyle === 'centered'
        }
      >
        <Breadcrumbs site={site} items={[{ label: 'Services' }]} />
      </HeroBanner>

      <SectionWrapper
        background={design.sectionRhythm === 'alternating' ? theme.secondaryColor : '#fff'}
        className={design.density === 'compact' ? 'py-12' : 'py-20'}
      >
        <p
          className={clsx(
            'mx-auto max-w-2xl text-lg leading-relaxed text-gray-600',
            design.family === 'utility' ? 'text-left' : 'text-center',
          )}
        >
          {content.intro}
        </p>
      </SectionWrapper>

      <SectionWrapper
        background={
          design.sectionRhythm === 'boldBands' ? theme.primaryColor : theme.secondaryColor
        }
        className={design.density === 'compact' ? 'py-12' : 'py-20'}
      >
        {useGrid ? (
          <div className={servicesGridClass(design.servicesLayout)}>
            {services.map((service, i) => (
              <Link
                key={service.title}
                href={`/${site.slug}/services/${slugifyService(service.title || `service-${i}`)}`}
                className="group flex flex-col overflow-hidden bg-white transition hover:-translate-y-1"
                style={{
                  borderRadius: 'var(--design-card-radius)',
                  boxShadow: 'var(--design-card-shadow)',
                  border: 'var(--design-card-border)',
                }}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  {DESIGN_PREVIEW_IMAGES.services[i] ? (
                    <SiteImage
                      src={DESIGN_PREVIEW_IMAGES.services[i]!}
                      alt={`${service.title} service`}
                      fill
                      className="object-cover transition group-hover:scale-105"
                      sizes="33vw"
                    />
                  ) : (
                    <div
                      className="flex h-full items-center justify-center"
                      style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.12) }}
                    >
                      {getIcon(service.icon || 'wrench', 'w-10 h-10')}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h2 className="text-xl font-bold text-gray-900">{service.title}</h2>
                  <p className="mt-2 flex-1 text-gray-600">{service.shortDescription}</p>
                  <span
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
                    style={{ color: theme.accentColor }}
                  >
                    Learn More <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            {services.map((service, i) => (
              <Link
                key={service.title}
                href={`/${site.slug}/services/${slugifyService(service.title || `service-${i}`)}`}
                className={clsx(
                  'group flex overflow-hidden bg-white transition hover:-translate-y-0.5',
                  useList ? 'flex-col sm:flex-row' : 'flex-col',
                )}
                style={{
                  borderRadius: 'var(--design-card-radius)',
                  boxShadow: 'var(--design-card-shadow)',
                  border: 'var(--design-card-border)',
                  borderLeft: `4px solid ${theme.accentColor}`,
                }}
              >
                <div className="relative aspect-[16/10] w-full shrink-0 sm:aspect-auto sm:w-56 md:w-72">
                  {DESIGN_PREVIEW_IMAGES.services[i] ? (
                    <SiteImage
                      src={DESIGN_PREVIEW_IMAGES.services[i]!}
                      alt={`${service.title}`}
                      fill
                      className="object-cover"
                      sizes="288px"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col justify-center p-6">
                  <h2 className="text-xl font-bold text-gray-900">{service.title}</h2>
                  <p className="mt-2 text-gray-600">{service.fullDescription || service.shortDescription}</p>
                  <span
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
                    style={{ color: theme.accentColor }}
                  >
                    Learn More <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionWrapper>

      <CtaBanner
        site={site}
        heading={content.cta?.heading || `Need help from ${site.businessName}?`}
        buttonText={content.cta?.buttonText || 'Contact Us'}
      />
    </>
  );
}
