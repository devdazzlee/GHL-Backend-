/**
 * Attach durable Pexels images to blog posts (cover + in-article multimedia).
 * Soft-fails when Pexels is unavailable so site generation never blocks on media.
 */

import { fetchPexelsImageByQuery } from './pexels.service.js';

function cleanQueryPart(value) {
  return String(value || '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCoverQuery({ industry, city, title }) {
  const topic = cleanQueryPart(title).split(' ').slice(0, 6).join(' ');
  return cleanQueryPart(`${topic || industry} ${industry} ${city}`).slice(0, 80);
}

function buildInlineQuery({ industry, city, heading }) {
  const topic = cleanQueryPart(heading).split(' ').slice(0, 5).join(' ');
  return cleanQueryPart(`${topic || industry} ${city}`).slice(0, 80);
}

/**
 * @returns {Promise<{ coverImageUrl: string|null, inlineImages: Array<{ afterSection: number, url: string, alt: string }> }>}
 */
export async function attachBlogPostMedia(businessData, post) {
  const industry = businessData?.industry || 'local business';
  const city = businessData?.city || '';
  const title = post?.title || 'Blog post';
  const sections = Array.isArray(post?.sections) ? post.sections : [];
  const used = [];

  const coverQuery = buildCoverQuery({ industry, city, title });
  let coverImageUrl = null;
  try {
    coverImageUrl = await fetchPexelsImageByQuery(coverQuery, { excludeUrls: used });
    if (coverImageUrl) used.push(coverImageUrl);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'blog_cover_image_failed',
        title,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  const inlineTargets = [0, 2].filter((index) => index < sections.length);
  const inlineImages = [];

  for (const afterSection of inlineTargets) {
    const heading = sections[afterSection]?.heading || title;
    const query = buildInlineQuery({ industry, city, heading });
    try {
      const url = await fetchPexelsImageByQuery(query, { excludeUrls: used });
      if (!url) continue;
      used.push(url);
      inlineImages.push({
        afterSection,
        url,
        alt: `${cleanQueryPart(heading) || title} — ${industry} in ${city}`.trim(),
      });
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'blog_inline_image_failed',
          title,
          afterSection,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  console.info(
    JSON.stringify({
      event: 'blog_media_attached',
      title,
      cover: Boolean(coverImageUrl),
      inlineCount: inlineImages.length,
    }),
  );

  return { coverImageUrl, inlineImages };
}

/**
 * Ensure a post has cover + inline images (idempotent for backfills).
 */
export async function ensureBlogPostMedia(businessData, post) {
  const existingInline = Array.isArray(post?.inlineImages) ? post.inlineImages : [];
  const hasCover = Boolean(post?.coverImageUrl);
  const hasInline = existingInline.length >= 1;
  if (hasCover && hasInline) {
    return post;
  }

  const media = await attachBlogPostMedia(businessData, post);
  return {
    ...post,
    coverImageUrl: post.coverImageUrl || media.coverImageUrl,
    inlineImages: existingInline.length ? existingInline : media.inlineImages,
  };
}
