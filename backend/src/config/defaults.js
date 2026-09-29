/** Production defaults — override per deploy via env only when needed. */
export const PRODUCTION_SITE_FRONTEND_URL = 'https://site.peakwa.com';

/** The admin dashboard (frontend VPS). */
export const PRODUCTION_DASHBOARD_URL = 'https://dashboard.peakwa.com';

/** Public IP of the frontend server (nginx + renderer); custom domains must point here. */
export const PRODUCTION_FRONTEND_IP = '169.58.4.58';
