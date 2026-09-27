/**
 * Server-side key the renderer sends to the backend's /phase4 read endpoints.
 * SITE_RENDERER_API_KEY is not NEXT_PUBLIC_, so it never reaches the browser.
 */
export function rendererHeaders(): Record<string, string> {
  const key = process.env.SITE_RENDERER_API_KEY?.trim();
  return key ? { 'x-site-api-key': key } : {};
}
