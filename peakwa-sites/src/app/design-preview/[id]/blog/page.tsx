import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { Breadcrumbs } from '@/src/components/Breadcrumbs';
import { HeroBanner } from '@/src/components/HeroBanner';
import { SectionWrapper } from '@/src/components/SectionWrapper';
import { SiteImage } from '@/src/components/SiteImage';
import { getDesignRecipe } from '@/src/designs/catalog';
import { sectionPadClass } from '@/src/designs/chrome';
import {
  DESIGN_PREVIEW_BLOG,
  DESIGN_PREVIEW_IMAGES,
} from '@/src/lib/designPreviewSample';
import { getPreviewContext } from '@/src/lib/designPreviewUtils';

type PageProps = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = getDesignRecipe(Number(id));
  return {
    title: `Blog · Preview ${recipe.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function DesignPreviewBlogPage({ params }: PageProps) {
  const { id } = await params;
  const { site, theme, design } = getPreviewContext(id);
  const posts = DESIGN_PREVIEW_BLOG.posts ?? [];
  const [featured, ...rest] = posts;
  const sidebar = rest.slice(0, 2);
  const more = rest.slice(2);

  return (
    <>
      <HeroBanner
        site={site}
        heroImage={DESIGN_PREVIEW_IMAGES.hero}
        title="Blog & Tips"
        subtitle={`Helpful local guides from ${site.businessName}.`}
        compact={design.heroLayout === 'compact' || design.family === 'utility'}
        centered={design.family === 'editorial' || design.navStyle === 'centered'}
      >
        <Breadcrumbs site={site} items={[{ label: 'Blog' }]} />
      </HeroBanner>

      <SectionWrapper background="#fff" className={sectionPadClass(design)}>
        {featured ? (
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.4fr_0.8fr]">
            <article
              className="overflow-hidden bg-white"
              style={{
                borderRadius: 'var(--design-card-radius)',
                boxShadow: 'var(--design-card-shadow)',
                border: 'var(--design-card-border)',
              }}
            >
              <div className="relative aspect-[16/10] w-full">
                <SiteImage
                  src={DESIGN_PREVIEW_IMAGES.blog[0]!}
                  alt={featured.title || 'Featured post'}
                  fill
                  className="object-cover"
                  sizes="60vw"
                />
              </div>
              <div className="p-6 md:p-8">
                <p
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: theme.accentColor }}
                >
                  {featured.category || 'Featured'} · {featured.readTime || '3 min'}
                </p>
                <h2 className="mt-3 text-2xl font-bold text-gray-900 md:text-3xl">
                  {featured.title}
                </h2>
                <p className="mt-4 text-gray-600">{featured.excerpt || featured.introduction}</p>
              </div>
            </article>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                More posts
              </h3>
              {sidebar.map((post, i) => (
                <article
                  key={post.title}
                  className="flex gap-4 bg-white p-4"
                  style={{
                    borderRadius: 'var(--design-card-radius)',
                    boxShadow: 'var(--design-card-shadow)',
                    border: 'var(--design-card-border)',
                  }}
                >
                  <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-md">
                    <SiteImage
                      src={DESIGN_PREVIEW_IMAGES.blog[i + 1] || DESIGN_PREVIEW_IMAGES.blog[0]!}
                      alt={post.title || 'Post'}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">
                      {post.category} · {post.readTime}
                    </p>
                    <h4 className="mt-1 text-sm font-semibold text-gray-900">{post.title}</h4>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-600">{post.excerpt}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </SectionWrapper>

      {more.length > 0 ? (
        <SectionWrapper background={theme.secondaryColor} className={sectionPadClass(design)}>
          <div className="mx-auto max-w-6xl">
            <h3
              className={clsx(
                'mb-8 text-2xl font-bold text-gray-900',
                design.family === 'editorial' ? 'text-center' : 'text-left',
              )}
            >
              More Articles
            </h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {more.map((post, i) => (
                <article
                  key={post.title}
                  className="overflow-hidden bg-white"
                  style={{
                    borderRadius: 'var(--design-card-radius)',
                    boxShadow: 'var(--design-card-shadow)',
                    border: 'var(--design-card-border)',
                  }}
                >
                  <div className="relative aspect-[16/10]">
                    <SiteImage
                      src={
                        DESIGN_PREVIEW_IMAGES.blog[
                          (i + 3) % DESIGN_PREVIEW_IMAGES.blog.length
                        ]!
                      }
                      alt={post.title || 'Article'}
                      fill
                      className="object-cover"
                      sizes="33vw"
                    />
                  </div>
                  <div className="p-5">
                    <p className="text-xs uppercase tracking-wide text-gray-400">
                      {post.category} · {post.readTime}
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-gray-900">{post.title}</h4>
                    <p className="mt-2 text-sm text-gray-600">{post.excerpt}</p>
                    <Link
                      href={`/${site.slug}/blog`}
                      className="mt-4 inline-block text-sm font-semibold"
                      style={{ color: theme.accentColor }}
                    >
                      Read more
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </SectionWrapper>
      ) : null}
    </>
  );
}
