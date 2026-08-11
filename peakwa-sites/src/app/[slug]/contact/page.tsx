import type { Metadata } from 'next';
import { Mail, MapPin, Phone } from 'lucide-react';
import { notFound } from 'next/navigation';
import clsx from 'clsx';
import { buildPageMetadata } from '@/src/lib/seo';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { ContactForm } from '@/src/components/ContactForm';
import { HeroBanner } from '@/src/components/HeroBanner';
import { ContactPageJsonLd } from '@/src/components/SchemaMarkup';
import { SeoContentSection } from '@/src/components/SeoContentSection';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { getSiteBySlug } from '@/src/lib/api';
import { parseJson, type ContactContent, type ServicesContent } from '@/src/lib/content';
import { getSiteImages } from '@/src/lib/images';
import { serviceRelatedLinks } from '@/src/lib/seoLinks';
import { getTextColor, resolveTheme } from '@/src/lib/theme';
import type { GeneratedSite } from '@/src/lib/types';
import { resolveDesignPreset } from '@/src/designs/presets';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return {};

  const contact = parseJson<ContactContent>(site.contactContent, {});
  if (!contact.seo?.title || !contact.seo?.metaDescription) return {};

  return buildPageMetadata({
    site,
    title: contact.seo.title,
    description: contact.seo.metaDescription,
    pathParts: [site.slug, 'contact'],
  });
}

export default async function ContactPage({ params }: PageProps) {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const images = await getSiteImages(slug);
  const content = parseJson<ContactContent>(site.contactContent, {});
  const servicesCatalog = parseJson<ServicesContent>(site.servicesContent, {});
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(site.designVariant);

  const siteAddress = (site as GeneratedSite & { address?: string | null }).address ?? '';
  const mapQuery = encodeURIComponent(`${siteAddress} ${site.city} ${site.state}`.trim());
  const mapSrc = `https://maps.google.com/maps?q=${mapQuery}&output=embed`;

  const formFirst =
    design.family === 'bold' ||
    design.heroLayout === 'formSidebar' ||
    design.family === 'utility';
  const stacked = design.family === 'editorial' || design.navStyle === 'centered';

  return (
    <>
      <ContactPageJsonLd
        site={site}
        description={content.seo?.metaDescription || content.intro || undefined}
        breadcrumbItems={[{ label: 'Contact' }]}
      />
      <HeroBanner
        site={site}
        heroImage={images.hero}
        title={content.hero?.heading || 'Contact Us'}
        subtitle={content.hero?.subheading || content.intro}
        compact={design.heroLayout === 'compact' || design.family === 'utility'}
        centered={stacked}
      >
        <Breadcrumbs site={site} skipSchema items={[{ label: 'Contact' }]} />
      </HeroBanner>

      <SectionWrapper
        background={design.sectionRhythm === 'alternating' ? theme.secondaryColor : '#fff'}
        className={design.density === 'compact' ? 'py-12' : 'py-20'}
      >
        <div
          className={clsx(
            'grid gap-12',
            stacked ? 'mx-auto max-w-2xl grid-cols-1' : 'lg:grid-cols-5',
            formFirst && !stacked && 'lg:[&>*:first-child]:order-2',
          )}
        >
          <div className={stacked ? '' : 'lg:col-span-3'}>
            <ContactForm site={site} slug={slug} heading={content.formHeading || 'Get in touch'} />
          </div>
          <aside
            className={clsx('p-8 shadow-xl', stacked ? '' : 'lg:col-span-2')}
            style={{
              backgroundColor:
                design.sectionRhythm === 'boldBands' ? theme.accentColor : theme.primaryColor,
              color: getTextColor(
                design.sectionRhythm === 'boldBands' ? theme.accentColor : theme.primaryColor,
              ),
              borderRadius: 'var(--design-card-radius)',
            }}
          >
            <h2 className="text-2xl font-bold">{site.businessName}</h2>
            <ul className="mt-8 space-y-5 text-sm">
              {site.phone ? (
                <li className="flex items-center gap-3">
                  <Phone className="h-5 w-5" />
                  <a href={`tel:${site.phone}`}>{site.phone}</a>
                </li>
              ) : null}
              {site.email ? (
                <li className="flex items-center gap-3">
                  <Mail className="h-5 w-5" />
                  <a href={`mailto:${site.email}`}>{site.email}</a>
                </li>
              ) : null}
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5" />
                <span>
                  {site.city}, {site.state}
                </span>
              </li>
            </ul>
            {content.hoursSection ? (
              <div className="mt-8 border-t border-white/20 pt-6">
                <p className="font-semibold">{content.hoursSection.heading}</p>
                <p className="mt-2 text-sm opacity-90">{content.hoursSection.description}</p>
              </div>
            ) : null}
          </aside>
        </div>
      </SectionWrapper>

      <SectionWrapper
        background={design.sectionRhythm === 'boldBands' ? '#fff' : theme.secondaryColor}
        className={design.density === 'compact' ? 'py-12' : 'py-20'}
      >
        <div
          className={clsx(
            'flex flex-col items-center',
            design.family === 'utility' ? 'text-left sm:items-start' : 'text-center',
          )}
        >
          <MapPin className="h-10 w-10" style={{ color: theme.accentColor }} />
          <p className="mt-3 text-lg font-semibold text-gray-800">
            {site.city}, {site.state}
          </p>
          <p className="mt-2 max-w-md text-sm text-gray-600">
            {content.addressSection?.heading || `Visit ${site.businessName} in ${site.city}`}
          </p>
        </div>

        <div
          className="mt-8 h-64 w-full overflow-hidden border border-gray-200 md:h-80"
          style={{ borderRadius: 'var(--design-card-radius)' }}
        >
          <iframe
            src={mapSrc}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`${site.businessName} location map`}
          />
        </div>

        <div className={clsx('mt-6', design.family === 'utility' ? 'text-left' : 'text-center')}>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold shadow-md transition hover:opacity-90"
            style={{
              backgroundColor: theme.accentColor,
              color: getTextColor(theme.accentColor),
              borderRadius: 'var(--design-button-radius)',
            }}
          >
            <MapPin className="h-4 w-4" />
            View on Google Maps
          </a>
        </div>
      </SectionWrapper>

      <SeoContentSection
        site={site}
        seoExtra={content.seoExtra}
        currentPath="contact"
        relatedLinks={[
          { label: 'All services', href: 'services' },
          ...serviceRelatedLinks(servicesCatalog.services, { limit: 2 }),
          { label: 'Our story', href: 'about' },
          { label: 'Read the blog', href: 'blog' },
        ]}
      />
    </>
  );
}
