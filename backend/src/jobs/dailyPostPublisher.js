import cron from 'node-cron';
import prisma from '../database/client.js';
import { RETRY_DELAYS_MS, sendFailureAlert, sleep } from '../services/alert.service.js';
import { generatePostContent } from '../services/contentGenerator.service.js';
import { getLocationMediaForDailyPost } from '../services/media.service.js';
import { fetchPexelsImage } from '../services/pexels.service.js';
import { publishPostForLocation } from '../services/posts.service.js';
import {
  getOrCreateLocationSchedule,
  getPostTypeForScheduledDay,
  hasPostedToday,
  isScheduledPostWindow,
} from '../services/schedule.service.js';

const MAX_RETRIES = 3;
const CRON_WINDOW_MINUTES = 15;

/**
 * Rough category label for post copy when no category is stored in DB.
 */
function inferCategoryLabel(businessName) {
  const n = businessName.toLowerCase();
  if (n.includes('car') || n.includes('auto') || n.includes('vehicle')) {
    return 'automotive';
  }
  if (n.includes('hvac') || n.includes('heating') || n.includes('cooling')) {
    return 'HVAC';
  }
  if (n.includes('restaurant') || n.includes('cafe') || n.includes('dining')) {
    return 'dining';
  }
  if (n.includes('salon') || n.includes('spa') || n.includes('beauty')) {
    return 'beauty';
  }
  return 'local business';
}

async function safeCreateAuditLog(data) {
  try {
    await prisma.auditLog.create({ data });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'daily_post_audit_log_failed',
        error: e?.message ?? String(e),
      }),
    );
  }
}

/**
 * Publish with retries only when the post row was not created (transient DB errors).
 */
async function publishLocationWithRetries(locationId, payload) {
  let lastError;
  const attempts = 1 + MAX_RETRIES;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const post = await publishPostForLocation(locationId, payload);
      if (post.status === 'FAILED') {
        const err = new Error(
          'Google Business Profile publish failed; post saved as FAILED and GHL updated.',
        );
        err.post = post;
        throw err;
      }
      return post;
    } catch (err) {
      if (err?.post?.status === 'FAILED') {
        throw err;
      }
      lastError = err;
      if (attempt < attempts) {
        console.warn(
          JSON.stringify({
            event: 'daily_post_retry',
            locationId,
            attempt,
            maxAttempts: attempts,
            error: err?.message ?? String(err),
          }),
        );
        await sleep(RETRY_DELAYS_MS);
      }
    }
  }

  throw lastError;
}

async function getRecentPostMediaUrls(locationId, limit = 20) {
  const recent = await prisma.post.findMany({
    where: { locationId, mediaUrl: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { mediaUrl: true },
  });
  return recent.map((p) => p.mediaUrl).filter(Boolean);
}

/**
 * Pexels first (varied stock photos); Cloudinary/media library only if Pexels unavailable.
 */
async function resolveDailyPostMediaUrl(locationId, businessName, category, city, publishType) {
  const recentUrls = await getRecentPostMediaUrls(locationId);

  let mediaUrl = await fetchPexelsImage(businessName, category, city, {
    excludeUrls: recentUrls,
  });
  let source = mediaUrl ? 'pexels' : null;

  if (!mediaUrl) {
    const { url, poolSize } = await getLocationMediaForDailyPost(locationId, publishType);
    mediaUrl = url;
    source = mediaUrl ? 'cloudinary' : null;
    console.info(
      JSON.stringify({
        event: 'daily_post_media_resolved',
        locationId,
        publishType,
        hasMedia: Boolean(mediaUrl),
        source,
        poolSize,
      }),
    );
    return mediaUrl;
  }

  console.info(
    JSON.stringify({
      event: 'daily_post_media_resolved',
      locationId,
      publishType,
      hasMedia: Boolean(mediaUrl),
      source,
    }),
  );

  return mediaUrl;
}

/**
 * @param {{ force?: boolean }} [options] - force=true skips schedule window and already-posted-today (manual job)
 */
export async function runDailyPostPublisher(options = {}) {
  const { force = false } = options;
  const now = new Date();

  const locations = await prisma.location.findMany({
    where: {
      status: 'ACTIVE',
      business: { status: 'ACTIVE' },
    },
    include: { business: true },
  });

  console.info(
    JSON.stringify({
      event: 'daily_post_job_start',
      locationCount: locations.length,
      force,
    }),
  );

  let ok = 0;
  let failed = 0;
  let skipped = 0;
  /** @type {Array<{ locationId: string; success: boolean; postId?: string; error?: string; skipped?: boolean; reason?: string }>} */
  const results = [];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000,
  );

  for (const loc of locations) {
    const locationId = loc.id;
    const businessName = loc.business?.name?.trim() || 'Business';
    const category = inferCategoryLabel(businessName);

    const schedule = await getOrCreateLocationSchedule(locationId);

    if (!force && !isScheduledPostWindow(schedule, now, CRON_WINDOW_MINUTES)) {
      skipped += 1;
      results.push({
        locationId: loc.id,
        success: false,
        skipped: true,
        reason: 'outside_schedule_window',
      });
      console.info(
        JSON.stringify({
          event: 'daily_post_skipped_schedule',
          locationId: loc.id,
          businessName,
          postDays: schedule.postDays,
          postTime: schedule.postTime,
          timezone: schedule.timezone,
        }),
      );
      continue;
    }

    if (!force && (await hasPostedToday(locationId, schedule.timezone))) {
      skipped += 1;
      results.push({
        locationId: loc.id,
        success: false,
        skipped: true,
        reason: 'already_posted_today',
      });
      console.info(
        JSON.stringify({
          event: 'daily_post_skipped_already_posted',
          locationId: loc.id,
          businessName,
        }),
      );
      continue;
    }

    const weekday = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: schedule.timezone || 'America/New_York',
    }).format(new Date());
    const { scheduleType, publishType } = getPostTypeForScheduledDay(schedule, weekday);

    try {
      // Inside the try: content generation now fails hard when competitor
      // research or a required brand mention cannot be satisfied, and that must
      // stop this location only — not abort the run for every other location.
      const content = await generatePostContent(
        locationId,
        businessName,
        category,
        'New Jersey',
        scheduleType,
        dayOfYear,
        loc.maxPostLength,
      );

      const mediaUrl = await resolveDailyPostMediaUrl(
        locationId,
        businessName,
        category,
        'New Jersey',
        publishType,
      );

      const post = await publishLocationWithRetries(loc.id, {
        type: publishType,
        content,
        mediaUrl,
      });

      ok += 1;
      results.push({ locationId: loc.id, success: true, postId: post.id });
      await safeCreateAuditLog({
        action: 'DAILY_POST_JOB_SUCCESS',
        locationId: loc.id,
        details: {
          postId: post.id,
          source: 'dailyPostPublisher',
          scheduleType,
          publishType,
        },
      });

      console.info(
        JSON.stringify({
          event: 'daily_post_location_ok',
          locationId: loc.id,
          businessName,
          ghlLocationId: loc.ghlLocationId,
          postId: post.id,
          scheduleType,
          publishType,
        }),
      );
    } catch (err) {
      failed += 1;
      const message = err?.message ?? String(err);
      const postId = err?.post?.id;
      results.push({
        locationId: loc.id,
        businessName,
        success: false,
        error: message,
        // Surfaces WHICH requirement failed (research vs brand mention) rather
        // than just that something did.
        ...(err?.code ? { code: err.code } : {}),
        ...(err?.details ? { details: err.details } : {}),
        ...(postId ? { postId } : {}),
      });

      console.error(
        JSON.stringify({
          event: 'daily_post_location_failed',
          locationId: loc.id,
          businessName,
          error: message,
          code: err?.code ?? null,
          details: err?.details ?? null,
          retriesExhausted: MAX_RETRIES,
        }),
      );

      await safeCreateAuditLog({
        action: 'DAILY_POST_JOB_FAILED',
        locationId: loc.id,
        details: {
          error: message,
          source: 'dailyPostPublisher',
          retriesExhausted: MAX_RETRIES,
        },
      });

      try {
        await sendFailureAlert(loc.id, businessName, message);
      } catch (alertErr) {
        console.error(
          JSON.stringify({
            event: 'failure_alert_send_failed',
            locationId: loc.id,
            error: alertErr?.message ?? String(alertErr),
          }),
        );
      }
    }
  }

  const summary = {
    locationCount: locations.length,
    ok,
    failed,
    skipped,
    results,
  };

  console.info(
    JSON.stringify({
      event: 'daily_post_job_complete',
      ok,
      failed,
      skipped,
    }),
  );

  return summary;
}

/** Every 15 minutes — each location posts at its configured postTime on postDays */
export function startDailyPostPublisher() {
  cron.schedule(
    '*/15 * * * *',
    async () => {
      try {
        await runDailyPostPublisher();
      } catch (e) {
        console.error(
          JSON.stringify({
            event: 'daily_post_job_fatal',
            error: e?.message ?? String(e),
          }),
        );
      }
    },
    { timezone: 'UTC' },
  );

  console.info(
    JSON.stringify({
      event: 'daily_post_scheduler_registered',
      cron: '*/15 * * * *',
      timezone: 'UTC',
      note: 'Per-location postTime and postDays from LocationSchedule',
    }),
  );
}
