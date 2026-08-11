/**
 * Attach cover + in-article Pexels images to existing blog posts.
 *
 * Usage: node src/scripts/backfillBlogMedia.js [siteSlug]
 * Default slug: ember-clay-studio-portland
 */
import prisma from '../database/client.js';
import { ensureBlogPostMedia } from '../services/blogMedia.service.js';
import { revalidateSiteFrontendCache } from '../services/siteRevalidation.service.js';

const DEFAULT_SLUG = 'ember-clay-studio-portland';

function parseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function backfillSite(site) {
  const blog = parseJson(site.blogContent, {});
  const posts = Array.isArray(blog.posts) ? blog.posts : [];
  if (posts.length === 0) {
    console.info(JSON.stringify({ event: 'blog_media_skip', slug: site.slug, reason: 'no_posts' }));
    return;
  }

  const businessData = {
    businessName: site.businessName,
    industry: site.industry,
    city: site.city,
    state: site.state,
  };

  const nextPosts = [];
  for (let i = 0; i < posts.length; i += 1) {
    const before = posts[i] || {};
    const after = await ensureBlogPostMedia(businessData, before);
    nextPosts.push(after);
    console.info(
      JSON.stringify({
        event: 'blog_media_post',
        slug: site.slug,
        index: i,
        title: after.title,
        cover: Boolean(after.coverImageUrl),
        inline: Array.isArray(after.inlineImages) ? after.inlineImages.length : 0,
        changed:
          before.coverImageUrl !== after.coverImageUrl ||
          JSON.stringify(before.inlineImages || []) !== JSON.stringify(after.inlineImages || []),
      }),
    );
  }

  await prisma.generatedSite.update({
    where: { id: site.id },
    data: { blogContent: JSON.stringify({ ...blog, posts: nextPosts }) },
  });

  const revalidate = await revalidateSiteFrontendCache(site.slug);
  console.info(
    JSON.stringify({
      event: 'blog_media_backfill_done',
      slug: site.slug,
      posts: nextPosts.length,
      revalidate,
    }),
  );
}

async function main() {
  const slug = process.argv[2] || DEFAULT_SLUG;
  const site = await prisma.generatedSite.findUnique({ where: { slug } });
  if (!site) throw new Error(`Site not found: ${slug}`);
  await backfillSite(site);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
