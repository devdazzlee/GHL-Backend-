import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { notFound } from 'next/navigation';
import { buildPageMetadata } from '@/src/lib/seo';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { BlogIndexJsonLd } from '@/src/components/SchemaMarkup';
import { SeoContentSection } from '@/src/components/SeoContentSection';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getSiteBySlug } from '@/src/lib/api';
import { parseJson, type BlogContent, type BlogPost, type ServicesContent } from '@/src/lib/content';
import { getSiteImages } from '@/src/lib/images';
import { serviceRelatedLinks } from '@/src/lib/seoLinks';
import { getTextColor, hexToRgb, resolveTheme } from '@/src/lib/theme';
import { resolveDesignPreset } from '@/src/designs/presets';
import clsx from 'clsx';

type PageProps = { params: Promise<{ slug: string }> };

const CARD_HOVER =
  'transition duration-300 ease-out hover:-translate-y-1 hover:shadow-lg';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) return {};

  const blog = parseJson<BlogContent>(site.blogContent, {});
  if (!blog.seo?.title || !blog.seo?.metaDescription) return {};

  return buildPageMetadata({
    site,
    title: blog.seo.title,
    description: blog.seo.metaDescription,
    pathParts: [site.slug, 'blog'],
  });
}

function colorWithOpacity(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function CategoryBadge({
  category,
  accentColor,
}: {
  category?: string;
  accentColor: string;
}) {
  return (
    <span
      className="inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: accentColor,
        color: getTextColor(accentColor),
      }}
    >
      {category || 'News'}
    </span>
  );
}

function BlogImage({
  src,
  alt,
  sizes,
  fallbackColor,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  fallbackColor: string;
}) {
  if (!src) {
    return (
      <div
        className="h-full w-full"
        style={{ backgroundColor: colorWithOpacity(fallbackColor, 0.15) }}
      />
    );
  }

  return (
    <SiteImage
      src={src}
      alt={alt}
      fill
      className="object-cover"
      sizes={sizes}
      fallback={
        <div
          className="h-full w-full"
          style={{ backgroundColor: colorWithOpacity(fallbackColor, 0.15) }}
        />
      }
    />
  );
}

function FeaturedPost({
  post,
  postIndex,
  slug,
  image,
  accentColor,
  primaryColor,
}: {
  post: BlogPost;
  postIndex: number;
  slug: string;
  image: string | null;
  accentColor: string;
  primaryColor: string;
}) {
  const accentText = getTextColor(accentColor);

  return (
    <article
      className={`overflow-hidden rounded-2xl bg-white shadow-sm ${CARD_HOVER}`}
    >
      <div className="relative h-[280px] w-full overflow-hidden sm:h-[340px] lg:h-[400px]">
        <BlogImage
          src={image}
          alt={post.title ?? 'Featured blog post'}
          sizes="(max-width: 1024px) 100vw, 66vw"
          fallbackColor={primaryColor}
        />
      </div>
      <div className="p-6 md:p-8">
        <CategoryBadge category={post.category} accentColor={accentColor} />
        <h2 className="mt-4 text-2xl font-bold leading-tight text-gray-900 md:text-3xl lg:text-4xl">
          {post.title}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-gray-600 md:text-lg">
          {post.excerpt}
        </p>
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Clock className="h-4 w-4 shrink-0" />
          {post.readTime || '5 min read'}
        </div>
        <Link
          href={`/${slug}/blog/${postIndex}`}
          className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:opacity-90"
          style={{ backgroundColor: accentColor, color: accentText }}
        >
          Read More
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function SidebarPost({
  post,
  postIndex,
  slug,
  image,
  accentColor,
  primaryColor,
}: {
  post: BlogPost;
  postIndex: number;
  slug: string;
  image: string | null;
  accentColor: string;
  primaryColor: string;
}) {
  return (
    <Link
      href={`/${slug}/blog/${postIndex}`}
      className={`group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ${CARD_HOVER}`}
    >
      <div className="relative h-[140px] w-full shrink-0 overflow-hidden sm:h-[160px]">
        <BlogImage
          src={image}
          alt={post.title ?? 'Blog post'}
          sizes="(max-width: 1024px) 100vw, 33vw"
          fallbackColor={primaryColor}
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <CategoryBadge category={post.category} accentColor={accentColor} />
        <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-snug text-gray-900 group-hover:underline">
          {post.title}
        </h3>
        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-gray-600">
          {post.excerpt}
        </p>
      </div>
    </Link>
  );
}

function GridPostCard({
  post,
  postIndex,
  slug,
  image,
  accentColor,
  primaryColor,
}: {
  post: BlogPost;
  postIndex: number;
  slug: string;
  image: string | null;
  accentColor: string;
  primaryColor: string;
}) {
  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ${CARD_HOVER}`}
    >
      <div className="relative h-[200px] w-full overflow-hidden">
        <BlogImage
          src={image}
          alt={post.title ?? 'Blog post'}
          sizes="(max-width: 768px) 100vw, 33vw"
          fallbackColor={primaryColor}
        />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <CategoryBadge category={post.category} accentColor={accentColor} />
        <h3 className="mt-3 text-lg font-bold leading-snug text-gray-900">{post.title}</h3>
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
          <Clock className="h-4 w-4 shrink-0" />
          {post.readTime || '5 min read'}
        </div>
        <Link
          href={`/${slug}/blog/${postIndex}`}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold transition group-hover:gap-3"
          style={{ color: accentColor }}
        >
          Read More
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export default async function BlogPage({ params }: PageProps) {
  const { slug } = await params;
  const site = await getSiteBySlug(slug);
  if (!site) notFound();

  const images = await getSiteImages(slug);
  const content = parseJson<BlogContent>(site.blogContent, {});
  const servicesCatalog = parseJson<ServicesContent>(site.servicesContent, {});
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(site.designVariant);
  const posts = content.posts ?? [];

  const featuredPost = posts[0];
  const sidebarPosts = posts.slice(1, 3);
  const morePosts = posts.slice(3);

  const postImage = (post: BlogPost | undefined, index: number) =>
    post?.coverImageUrl || images.blog[index] || null;

  const heroImage = postImage(featuredPost, 0) ?? images.hero ?? null;
  const heroTextColor = heroImage ? '#FFFFFF' : getTextColor(theme.primaryColor);
  const compactHero = design.heroLayout === 'compact' || design.family === 'utility';
  const centeredHero =
    design.heroLayout === 'fullBleedCentered' ||
    design.family === 'editorial' ||
    design.navStyle === 'centered';

  return (
    <>
      <BlogIndexJsonLd
        site={site}
        description={content.seo?.metaDescription || undefined}
        breadcrumbItems={[{ label: 'Blog' }]}
      />
      <section
        className={clsx(
          'relative flex items-end overflow-hidden',
          compactHero ? 'min-h-[240px] md:min-h-[280px]' : 'min-h-[320px] md:min-h-[380px]',
        )}
      >
        {heroImage ? (
          <>
            <div className="absolute inset-0">
              <SiteImage
                src={heroImage}
                alt={`${site.businessName} blog`}
                fill
                className="object-cover object-center"
                priority
                sizes="100vw"
                fallback={
                  <div
                    className="h-full w-full"
                    style={{ backgroundColor: theme.primaryColor }}
                  />
                }
              />
            </div>
            <div
              className="absolute inset-0"
              style={{ backgroundColor: colorWithOpacity(theme.primaryColor, 0.72) }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: theme.primaryColor }}
          />
        )}
        <div
          className={clsx(
            'relative z-10 mx-auto w-full max-w-6xl px-4 pb-12 pt-24 sm:px-6 lg:px-8',
            centeredHero && 'text-center',
          )}
          style={{ color: heroTextColor }}
        >
          <Breadcrumbs site={site} skipSchema items={[{ label: 'Blog' }]} />
          <h1 className="mt-4 text-4xl font-bold md:text-5xl">Blog</h1>
          <p
            className={clsx(
              'mt-3 max-w-2xl text-lg opacity-90',
              centeredHero && 'mx-auto',
            )}
          >
            Insights, tips, and updates from {site.businessName} in {site.city}, {site.state}
          </p>
        </div>
      </section>

      {posts.length === 0 ? (
        <SectionWrapper background="#fff" className="py-20">
          <p className="text-center text-lg text-gray-500">No blog posts yet.</p>
        </SectionWrapper>
      ) : (
        <>
          <SectionWrapper background="#fff" className="py-12 md:py-16">
            <div className="mx-auto max-w-6xl">
              <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
                {featuredPost ? (
                  <div className="lg:col-span-2">
                    <FeaturedPost
                      post={featuredPost}
                      postIndex={0}
                      slug={slug}
                      image={postImage(featuredPost, 0) ?? heroImage}
                      accentColor={theme.accentColor}
                      primaryColor={theme.primaryColor}
                    />
                  </div>
                ) : null}

                {sidebarPosts.length > 0 ? (
                  <div className="flex flex-col gap-6 lg:col-span-1">
                    {sidebarPosts.map((post, i) => {
                      const postIndex = i + 1;
                      return (
                        <SidebarPost
                          key={`sidebar-${post.title}-${postIndex}`}
                          post={post}
                          postIndex={postIndex}
                          slug={slug}
                          image={postImage(post, postIndex)}
                          accentColor={theme.accentColor}
                          primaryColor={theme.primaryColor}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </SectionWrapper>

          {morePosts.length > 0 ? (
            <SectionWrapper background={theme.secondaryColor} className="py-12 md:py-16">
              <div className="mx-auto max-w-6xl">
                <div className="mb-10 border-t border-gray-200 pt-10" aria-hidden />
                <h2 className="mb-8 text-2xl font-bold text-gray-900 md:text-3xl">
                  More Articles
                </h2>
                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {morePosts.map((post, i) => {
                    const postIndex = i + 3;
                    return (
                      <GridPostCard
                        key={`grid-${post.title}-${postIndex}`}
                        post={post}
                        postIndex={postIndex}
                        slug={slug}
                        image={postImage(post, postIndex)}
                        accentColor={theme.accentColor}
                        primaryColor={theme.primaryColor}
                      />
                    );
                  })}
                </div>
              </div>
            </SectionWrapper>
          ) : null}
        </>
      )}

      <SeoContentSection
        site={site}
        seoExtra={content.seoExtra}
        currentPath="blog"
        relatedLinks={[
          { label: 'All services', href: 'services' },
          ...serviceRelatedLinks(servicesCatalog.services, { limit: 2 }),
          { label: 'Our story', href: 'about' },
          { label: 'Get in touch', href: 'contact' },
        ]}
      />
    </>
  );
}
