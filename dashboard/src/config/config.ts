/**
 * Global app config for the Peakwa admin dashboard.
 * Edit these values when deploying — no .env required.
 *
 * Local:
 *   API_URL = http://localhost:4000
 *   SITE_BASE_URL = http://localhost:3000
 *
 * Testing (Vercel / Railway):
 *   API_URL = https://ghl-backend-production-5893.up.railway.app
 *   SITE_BASE_URL = https://ghl-backend-eopr.vercel.app
 *
 * Production (peakwa.com):
 *   API_URL = https://ghl-backend-production-5893.up.railway.app
 *   SITE_BASE_URL = https://site.peakwa.com
 */

// --- Active config ---
// export const API_URL = 'http://localhost:4000';
// export const SITE_BASE_URL = 'http://localhost:3000';

// --- Production example (swap API_URL when deploying dashboard) ---
export const API_URL = 'https://ghl-backend-production-5893.up.railway.app';
export const SITE_BASE_URL = 'https://site.peakwa.com';
