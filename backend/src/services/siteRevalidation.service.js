import { PRODUCTION_SITE_FRONTEND_URL } from '../config/defaults.js';
import { env } from '../config/env.js';

function frontendBaseUrl() {
  const configured = String(env.SITE_FRONTEND_URL ?? '').trim();
  return (configured || PRODUCTION_SITE_FRONTEND_URL).replace(/\/$/, '');
}

/**
 * Purges the Next.js data cache for a site after backend content changes.
 * The secret comes only from REVALIDATE_SECRET; without it the purge is
 * skipped (pages refresh on their normal 1-hour cache instead). Never throws.
 */
export async function revalidateSiteFrontendCache(slug) {
  const secret = String(env.REVALIDATE_SECRET ?? '').trim();
  if (!secret) {
    console.warn(JSON.stringify({ event: 'frontend_revalidate_skipped', slug, reason: 'REVALIDATE_SECRET not set' }));
    return { ok: false, skipped: true };
  }

  try {
    const response = await fetch(`${frontendBaseUrl()}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, slug }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn(
        JSON.stringify({ event: 'frontend_revalidate_failed', slug, status: response.status, payload }),
      );
      return { ok: false, status: response.status, payload };
    }

    console.info(JSON.stringify({ event: 'frontend_revalidate_success', slug, payload }));
    return { ok: true, payload };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'frontend_revalidate_failed',
        slug,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return { ok: false };
  }
}
