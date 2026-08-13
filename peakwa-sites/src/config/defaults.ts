/** Production defaults — override per deploy via env only when needed. */
export const PRODUCTION_SITE_BASE_URL = 'https://site.peakwa.com';
export const PRODUCTION_API_URL = 'https://backend.peakwa.com';
export const PRODUCTION_REVALIDATE_SECRET = 'peakwa-sites-cache-revalidate';

export const LOCAL_SITE_BASE_URL = 'http://localhost:3000';
export const LOCAL_API_URL = 'http://localhost:4000';
export const LOCAL_REVALIDATE_SECRET = 'local-dev-revalidate';
