import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import clsx from 'clsx';
import { buildPageMetadata } from '@/src/lib/seo';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { CtaBanner } from '@/src/components/CtaBanner';
import { HeroBanner } from '@/src/components/HeroBanner';
import { ServiceSchema } from '@/src/components/SchemaMarkup';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getSiteBySlug } from '@/src/lib/api';
import { parseJson, type ServicesContent } from '@/src/lib/content';
import { getIcon } from '@/src/lib/iconMap';
import { getSiteImages } from '@/src/lib/images';
import { getTextColor, hexToRgb, resolveTheme } from '@/src/lib/theme';
import { resolveDesignPreset, servicesGridClass } from '@/src/designs/presets';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return {};

  const services = parseJson<ServicesContent>(site.servicesContent, {});
  if (!services.seo?.title || !services.seo?.metaDescription) return {};

  return buildPageMetadata({
    site,
    title: services.seo.title,
    description: services.seo.metaDescription,
    pathParts: [site.slug, 'services'],
  });
}

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default async function ServicesPage({ params }: PageProps) {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const images = await getSiteImages(slug);
  const content = parseJson<ServicesContent>(site.servicesContent, {});
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(site.designVariant);
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
      <ServiceSchema businessName={site.businessName} services={services} businessSlug={slug} />
      <HeroBanner
        site={site}
        heroImage={images.hero}
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
                key={`${service.title}-${i}`}
                href={`/${slug}/services/${slugify(service.title || `service-${i}`)}`}
                className="group flex flex-col overflow-hidden bg-white transition hover:-translate-y-1"
                style={{
                  borderRadius: 'var(--design-card-radius)',
                  boxShadow: 'var(--design-card-shadow)',
                  border: 'var(--design-card-border)',
                }}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  {images.services[i] ? (
                    <SiteImage
                      src={images.services[i]!}
                      alt={`${service.title} service`}
                      fill
                      className="object-cover object-center transition group-hover:scale-105"
                      sizes="(max-width: 1024px) 100vw, 33vw"
                      fallback={
                        <div
                          className="flex h-full items-center justify-center"
                          style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.12) }}
                        >
                          {getIcon(service.icon || 'wrench', 'w-10 h-10')}
                        </div>
                      }
                    />
                  ) : (
                    <div
                      className="flex h-full items-center justify-center"
                      style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.12) }}
                    >
                      <span style={{ color: theme.accentColor }}>
                        {getIcon(service.icon || 'wrench', 'w-10 h-10')}
                      </span>
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
                    Read More <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : useList ? (
          <div className="mx-auto max-w-4xl space-y-4">
            {services.map((service, i) => (
              <Link
                key={`${service.title}-${i}`}
                href={`/${slug}/services/${slugify(service.title || `service-${i}`)}`}
                className="group flex flex-col overflow-hidden bg-white transition hover:-translate-y-0.5 sm:flex-row"
                style={{
                  borderRadius: 'var(--design-card-radius)',
                  boxShadow: 'var(--design-card-shadow)',
                  border: 'var(--design-card-border)',
                  borderLeft: `4px solid ${theme.accentColor}`,
                }}
              >
                <div className="relative aspect-[16/10] w-full shrink-0 sm:aspect-auto sm:w-48 md:w-56">
                  {images.services[i] ? (
                    <SiteImage
                      src={images.services[i]!}
                      alt={`${service.title} service`}
                      fill
                      className="object-cover object-center"
                      sizes="224px"
                      fallback={
                        <div
                          className="flex h-full min-h-[140px] items-center justify-center"
                          style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.12) }}
                        >
                          {getIcon(service.icon || 'wrench', 'w-8 h-8')}
                        </div>
                      }
                    />
                  ) : (
                    <div
                      className="flex h-full min-h-[140px] items-center justify-center"
                      style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.12) }}
                    >
                      <span style={{ color: theme.accentColor }}>
                        {getIcon(service.icon || 'wrench', 'w-8 h-8')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-center p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span style={{ color: theme.accentColor }}>
                      {getIcon(service.icon || 'wrench', 'w-6 h-6')}
                    </span>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{service.title}</h2>
                      <p className="mt-2 text-gray-600">{service.shortDescription}</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-20">
            {services.map((service, i) => (
              <article
                key={`${service.title}-${i}`}
                id={slugify(service.title || `service-${i}`)}
                className={`grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 ${
                  i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
                }`}
              >
                <div
                  className="overflow-hidden bg-white shadow-xl"
                  style={{ borderRadius: 'var(--design-card-radius)' }}
                >
                  {images.services[i] ? (
                    <div className="relative aspect-[4/3] w-full">
                      <SiteImage
                        src={images.services[i]!}
                        alt={`${service.title} service`}
                        fill
                        className="object-cover object-center"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        fallback={
                          <div
                            className="flex h-full flex-col items-center justify-center gap-4"
                            style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.12) }}
                          >
                            <span style={{ color: theme.accentColor }}>
                              {getIcon(service.icon || 'wrench', 'w-16 h-16')}
                            </span>
                          </div>
                        }
                      />
                    </div>
                  ) : (
                    <div
                      className="flex aspect-[4/3] flex-col items-center justify-center gap-4"
                      style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.12) }}
                    >
                      <span style={{ color: theme.accentColor }}>
                        {getIcon(service.icon || 'wrench', 'w-16 h-16')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="py-4">
                  <span
                    className="text-sm font-bold uppercase tracking-widest"
                    style={{ color: theme.accentColor }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2 className="mt-2 text-3xl font-bold text-gray-900">
                    <Link
                      href={`/${slug}/services/${slugify(service.title || `service-${i}`)}`}
                      className="transition hover:opacity-80"
                    >
                      {service.title}
                    </Link>
                  </h2>
                  <p className="mt-3 text-lg font-medium text-gray-700">{service.shortDescription}</p>
                  <p className="mt-4 leading-relaxed text-gray-600">{service.fullDescription}</p>
                  <Link
                    href={`/${slug}/services/${slugify(service.title || `service-${i}`)}`}
                    className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold transition hover:opacity-90"
                    style={{
                      backgroundColor: theme.accentColor,
                      color: getTextColor(theme.accentColor),
                      borderRadius: 'var(--design-button-radius)',
                    }}
                  >
                    Read More <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionWrapper>

      {content.cta ? (
        <CtaBanner
          site={site}
          heading={content.cta.heading || `Ready to work with ${site.businessName}?`}
          buttonText={content.cta.buttonText || 'Contact Us'}
        />
      ) : null}
    </>
  );
}
