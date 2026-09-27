import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { notFound, permanentRedirect } from 'next/navigation';
import clsx from 'clsx';
import { buildPageMetadata } from '@/src/lib/seo';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { BlogPostJsonLd } from '@/src/components/SchemaMarkup';
import { FaqAccordion } from '@/src/components/FaqAccordion';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getPublishedBlog, getPublishedBlogPost, getSiteBySlug } from '@/src/lib/api';
import { isBlogEnabled } from '@/src/lib/blog';
import {
  legacyPostBlocks,
  parseBlogMarkdown,
  resolveHref,
  type ArticleBlock,
  type InlinePart,
} from '@/src/lib/blogMarkdown';
import { parseJson, type BlogContent } from '@/src/lib/content';
import { getSiteImages } from '@/src/lib/images';
import type { GeneratedSite } from '@/src/lib/types';
import { getTextColor, hexToRgb, resolveTheme } from '@/src/lib/theme';
import { resolveDesignPreset } from '@/src/designs/presets';
import { contentMaxClass, sectionPadClass } from '@/src/designs/chrome';

type PageProps = { params: Promise<{ slug: string; postSlug: string }> };

/** Everything the page needs, whether the post is managed (BlogPost) or still stored with the site. */
type Article = {
  /** Segment after /{site}/blog/ */
  path: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  imageUrl: string | null;
  blocks: ArticleBlock[];
  faqs: { question: string; answer: string }[];
  links: { label: string; path: string }[];
  related: { path: string; title: string }[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

type Lookup = { article: Article } | { redirectTo: string } | null;

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function cleanFaqs(faqs: Array<{ question?: string; answer?: string }> | undefined) {
  return (faqs ?? [])
    .map((f) => ({ question: (f?.question ?? '').trim(), answer: (f?.answer ?? '').trim() }))
    .filter((f) => f.question && f.answer);
}

function cleanLinks(links: Array<{ label?: string; path?: string }> | undefined) {
  return (links ?? [])
    .filter((l): l is { label: string; path: string } => Boolean(l?.label && l?.path))
    .map((l) => ({ label: l.label, path: String(l.path) }));
}

async function lookupArticle(site: GeneratedSite, postSlug: string): Promise<Lookup> {
  if (!isBlogEnabled(site)) return null;
  const blog = await getPublishedBlog(site.slug);
  if (!blog.enabled) return null;
  const numeric = /^\d+$/.test(postSlug) ? Number(postSlug) : null;

  if (blog.managed) {
    // Old /blog/{n} links point at the post that was n-th when the site was generated.
    if (numeric !== null) {
      const moved = blog.posts.find((p) => p.legacyIndex === numeric);
      return moved ? { redirectTo: `/${site.slug}/blog/${moved.slug}` } : null;
    }
    const post = await getPublishedBlogPost(site.slug, postSlug);
    if (!post) return null;
    return {
      article: {
        path: post.slug,
        title: post.title,
        excerpt: post.excerpt ?? '',
        category: post.category || 'News',
        readTime: post.readTime,
        imageUrl: post.imageUrl,
        blocks: parseBlogMarkdown(post.body),
        faqs: cleanFaqs(post.faqs),
        links: cleanLinks(post.links),
        related: post.related.map((r) => ({ path: r.slug, title: r.title })),
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
      },
    };
  }

  // Not managed yet: the posts generated with the site, by position.
  const posts = parseJson<BlogContent>(site.blogContent, {}).posts ?? [];
  const post = numeric !== null ? posts[numeric] : undefined;
  if (!post) return null;
  const images = await getSiteImages(site.slug);
  return {
    article: {
      path: String(numeric),
      title: post.title ?? '',
      excerpt: post.excerpt ?? '',
      category: post.category || 'News',
      readTime: post.readTime || '5 min read',
      imageUrl: post.coverImageUrl || images.blog[numeric!] || null,
      blocks: legacyPostBlocks(post),
      faqs: cleanFaqs(post.faqs),
      links: cleanLinks(post.internalLinks),
      related: posts
        .map((p, i) => ({ path: String(i), title: p.title ?? '' }))
        .filter((p) => p.path !== String(numeric) && p.title)
        .slice(0, 3),
      seoTitle: post.seo?.title,
      seoDescription: post.seo?.metaDescription,
    },
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, postSlug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return {};
  const found = await lookupArticle(site, postSlug);
  if (!found || !('article' in found)) return {};
  const { article } = found;

  return buildPageMetadata({
    site,
    title: article.seoTitle || `${article.title} | ${site.businessName}`,
    description: article.seoDescription || article.excerpt || `${article.title} from ${site.businessName}.`,
    pathParts: [site.slug, 'blog', article.path],
    openGraphType: 'article',
  });
}

function InlineText({ parts, slug, linkColor }: { parts: InlinePart[]; slug: string; linkColor: string }) {
  return (
    <>
      {parts.map((part, i) => {
        const href = part.href ? resolveHref(part.href, slug) : null;
        if (!href) return <span key={i}>{part.text}</span>;
        const external = /^https?:\/\//i.test(href);
        return external ? (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: linkColor }}>
            {part.text}
          </a>
        ) : (
          <Link key={i} href={href} className="font-semibold underline" style={{ color: linkColor }}>
            {part.text}
          </Link>
        );
      })}
    </>
  );
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug, postSlug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const found = await lookupArticle(site, postSlug);
  if (!found) notFound();
  if ('redirectTo' in found) permanentRedirect(found.redirectTo);
  const { article } = found;

  const theme = resolveTheme(site);
  const design = resolveDesignPreset(site.designVariant);
  const headingClass = clsx(
    design.family === 'bold' && 'font-bold uppercase tracking-wide',
    design.family === 'editorial' && 'font-medium',
    design.family !== 'bold' && design.family !== 'editorial' && 'font-bold',
  );
  const breadcrumbItems = [{ label: 'Blog', href: `/${slug}/blog` }, { label: article.title || 'Article' }];

  return (
    <>
      <BlogPostJsonLd
        title={article.title}
        excerpt={article.excerpt}
        businessName={site.businessName}
        slug={slug}
        postPath={article.path}
        site={site}
        faqs={article.faqs}
        imageUrl={article.imageUrl}
        datePublished={article.publishedAt}
        dateModified={article.updatedAt}
        breadcrumbItems={breadcrumbItems}
      />
      <SectionWrapper background="#fff" className={sectionPadClass(design)}>
        <div className={contentMaxClass(design)}>
          <Breadcrumbs site={site} skipSchema items={breadcrumbItems} />

          <Link href={`/${slug}/blog`} className="mb-6 inline-flex text-sm font-semibold" style={{ color: theme.accentColor }}>
            ← Back to blog
          </Link>

          {article.imageUrl ? (
            <div className="relative mb-8 aspect-[16/10] w-full overflow-hidden" style={{ borderRadius: 'var(--design-card-radius)' }}>
              <SiteImage
                src={article.imageUrl}
                alt={article.title || 'Blog post'}
                fill
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 768px"
                priority
                fallback={<div className="h-full w-full" style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.15) }} />}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: theme.accentColor, color: getTextColor(theme.accentColor) }}
            >
              {article.category}
            </span>
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              {article.readTime}
            </p>
          </div>

          <h1 className={clsx('mt-6 text-3xl text-gray-900 md:text-4xl', headingClass)}>{article.title}</h1>
          <p className="mt-3 text-sm text-gray-500">Author: {site.businessName}</p>

          <div className="my-8 h-px w-full bg-gray-200" />

          <article className="max-w-none text-gray-700">
            {article.blocks.map((block, i) => {
              switch (block.type) {
                case 'h2':
                  return (
                    <h2 key={i} className={clsx('mb-4 mt-10 text-2xl text-gray-900', headingClass)}>
                      {block.text}
                    </h2>
                  );
                case 'h3':
                  return (
                    <h3 key={i} className={clsx('mb-3 mt-6 text-xl text-gray-900', headingClass)}>
                      {block.text}
                    </h3>
                  );
                case 'ul':
                  return (
                    <ul key={i} className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed">
                      {block.items.map((item, j) => (
                        <li key={j}>
                          <InlineText parts={item} slug={slug} linkColor={theme.accentColor} />
                        </li>
                      ))}
                    </ul>
                  );
                case 'img':
                  return (
                    <div key={i} className="relative my-8 aspect-[16/9] w-full overflow-hidden" style={{ borderRadius: 'var(--design-card-radius)' }}>
                      <SiteImage
                        src={block.url}
                        alt={block.alt || article.title || 'Article image'}
                        fill
                        className="object-cover object-center"
                        sizes="(max-width: 768px) 100vw, 768px"
                        fallback={<div className="h-full w-full" style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.12) }} />}
                      />
                    </div>
                  );
                default:
                  return (
                    <p
                      key={i}
                      className={clsx(
                        'mb-6 leading-relaxed',
                        block.variant === 'lead' ? 'mb-8 text-xl text-gray-800' : 'text-lg',
                        block.variant === 'closing' && 'mt-8 font-medium text-gray-800',
                      )}
                    >
                      <InlineText parts={block.parts} slug={slug} linkColor={theme.accentColor} />
                    </p>
                  );
              }
            })}
          </article>

          {article.links.length > 0 || article.related.length > 0 ? (
            <section className="mt-12">
              <div className="mb-6 h-px w-full bg-gray-200" />
              <h2 className={clsx('text-2xl text-gray-900', headingClass)}>Explore more</h2>
              <ul className="mt-4 space-y-2">
                {article.links.map((link, i) => {
                  const href = resolveHref(link.path, slug);
                  return href ? (
                    <li key={`il-${i}`}>
                      <Link href={href} className="text-lg font-semibold hover:underline" style={{ color: theme.accentColor }}>
                        {link.label}
                      </Link>
                    </li>
                  ) : null;
                })}
                {article.related.map((post) => (
                  <li key={`rel-${post.path}`}>
                    <Link href={`/${slug}/blog/${post.path}`} className="text-lg font-semibold hover:underline" style={{ color: theme.accentColor }}>
                      {post.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {article.faqs.length > 0 ? (
            <section className="mt-12">
              <div className="mb-8 h-px w-full bg-gray-200" />
              <h2 className={clsx('mb-6 text-2xl text-gray-900', headingClass)}>Frequently Asked Questions</h2>
              <FaqAccordion faqs={article.faqs} accentColor={theme.accentColor} />
            </section>
          ) : null}
        </div>
      </SectionWrapper>
    </>
  );
}
