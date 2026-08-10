import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { notFound } from 'next/navigation';
import clsx from 'clsx';
import { buildPageMetadata } from '@/src/lib/seo';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { ArticleSchema, FAQSchema } from '@/src/components/SchemaMarkup';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getSiteBySlug } from '@/src/lib/api';
import { parseJson, type BlogContent } from '@/src/lib/content';
import { getSiteImages } from '@/src/lib/images';
import { getTextColor, hexToRgb, resolveTheme } from '@/src/lib/theme';
import { resolveDesignPreset } from '@/src/designs/presets';
import {
  cardChromeStyle,
  contentMaxClass,
  sectionPadClass,
} from '@/src/designs/chrome';

type PageProps = { params: Promise<{ slug: string; postIndex: string }> };

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, postIndex } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return {};

  const blog = parseJson<BlogContent>(site.blogContent, {});
  const post = blog?.posts?.[Number.parseInt(postIndex, 10)];
  if (!post) return {};
  if (!post.seo?.title || !post.seo?.metaDescription) return {};

  return buildPageMetadata({
    site,
    title: post.seo.title,
    description: post.seo.metaDescription,
    pathParts: [site.slug, 'blog', postIndex],
    openGraphType: 'article',
  });
}

/** Legacy posts store a single flat string; split it into clean paragraphs. */
function splitParagraphs(content: string): string[] {
  return content
    .split(/\n\n+|\.\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`));
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug, postIndex } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const images = await getSiteImages(slug);
  const content = parseJson<BlogContent>(site.blogContent, {});
  const index = Number.parseInt(postIndex, 10);
  const post = content.posts?.[index];
  if (!post) notFound();

  const theme = resolveTheme(site);
  const design = resolveDesignPreset(site.designVariant);
  const blogImage = images.blog[index] ?? null;

  const sections = (post.sections ?? []).filter(
    (s) => s && (s.heading || (s.paragraphs?.some((p) => p?.trim()) ?? false)),
  );

  const faqs = (post.faqs ?? [])
    .map((f) => ({ question: (f?.question ?? '').trim(), answer: (f?.answer ?? '').trim() }))
    .filter((f) => f.question && f.answer);

  // Older posts predate the structured format and only have a flat `content`
  // string. Render it as plain paragraphs (no invented headings) so nothing
  // breaks until the site is regenerated with structured content.
  const legacyParagraphs =
    sections.length === 0 ? splitParagraphs(post.content || '') : [];

  const headingClass = clsx(
    design.family === 'bold' && 'font-bold uppercase tracking-wide',
    design.family === 'editorial' && 'font-medium',
    design.family !== 'bold' && design.family !== 'editorial' && 'font-bold',
  );

  return (
    <>
      <ArticleSchema
        title={post.title || ''}
        excerpt={post.excerpt || ''}
        businessName={site.businessName}
        slug={slug}
        postIndex={index}
      />
      <FAQSchema faqs={faqs} />
      <SectionWrapper background="#fff" className={sectionPadClass(design)}>
        <div className={contentMaxClass(design)}>
          <Breadcrumbs
            site={site}
            items={[
              { label: 'Blog', href: `/${slug}/blog` },
              { label: post.title || 'Article' },
            ]}
          />

          <Link
            href={`/${slug}/blog`}
            className="mb-6 inline-flex text-sm font-semibold"
            style={{ color: theme.accentColor }}
          >
            ← Back to blog
          </Link>

          {blogImage ? (
            <div
              className="relative mb-8 aspect-[16/10] w-full overflow-hidden"
              style={{ borderRadius: 'var(--design-card-radius)' }}
            >
              <SiteImage
                src={blogImage}
                alt={post.title || 'Blog post'}
                fill
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 768px"
                priority
                fallback={
                  <div
                    className="h-full w-full"
                    style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.15) }}
                  />
                }
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor: theme.accentColor,
                color: getTextColor(theme.accentColor),
              }}
            >
              {post.category || 'News'}
            </span>
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              {post.readTime || '5 min read'}
            </p>
          </div>

          <h1 className={clsx('mt-6 text-3xl text-gray-900 md:text-4xl', headingClass)}>
            {post.title}
          </h1>
          <p className="mt-3 text-sm text-gray-500">Author: {site.businessName}</p>

          <div className="my-8 h-px w-full bg-gray-200" />

          <article className="max-w-none text-gray-700">
            {post.introduction ? (
              <p className="mb-8 text-xl leading-relaxed text-gray-800">{post.introduction}</p>
            ) : null}

            {sections.map((section, i) => (
              <section key={`section-${i}`} className="mb-8">
                {section.heading ? (
                  <h2 className={clsx('mb-4 mt-10 text-2xl text-gray-900', headingClass)}>
                    {section.heading}
                  </h2>
                ) : null}
                {(section.paragraphs ?? [])
                  .filter((p) => p?.trim())
                  .map((paragraph, j) => (
                    <p key={`p-${i}-${j}`} className="mb-6 text-lg leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
              </section>
            ))}

            {legacyParagraphs.map((paragraph, i) => (
              <p key={`legacy-${i}`} className="mb-6 text-lg leading-relaxed">
                {paragraph}
              </p>
            ))}

            {post.conclusion ? (
              <p className="mt-8 text-lg font-medium leading-relaxed text-gray-800">
                {post.conclusion}
              </p>
            ) : null}
          </article>

          {faqs.length > 0 ? (
            <section className="mt-12">
              <div className="mb-8 h-px w-full bg-gray-200" />
              <h2 className={clsx('text-2xl text-gray-900', headingClass)}>
                Frequently Asked Questions
              </h2>
              <div className="mt-6 space-y-4">
                {faqs.map((faq, i) => (
                  <div
                    key={`faq-${i}`}
                    className="bg-white p-6"
                    style={cardChromeStyle()}
                  >
                    <p className="font-bold text-gray-900">{faq.question}</p>
                    <p className="mt-2 leading-relaxed text-gray-600">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </SectionWrapper>
    </>
  );
}
