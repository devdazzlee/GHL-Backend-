import dotenv from 'dotenv';
import { PRODUCTION_DASHBOARD_URL, PRODUCTION_FRONTEND_IP, PRODUCTION_SITE_FRONTEND_URL } from './defaults.js';

dotenv.config();

function truthyEnv(name) {
  return String(process.env[name] ?? '').toLowerCase() === 'true';
}

/**
 * Browser origins the API trusts: CORS for the dashboard and the sites' contact form,
 * and where the Google-connect flow may send the browser back to. Built in: the
 * production dashboard and sites, and local dev. DASHBOARD_URL, SITE_URL,
 * SITE_FRONTEND_URL and CORS_ORIGINS (comma separated) add more. Live custom domains
 * are added at runtime (siteDomains.service.js).
 */
export function parseCorsOrigins(source = process.env) {
  const toOrigin = (value) => {
    try {
      return new URL(String(value).trim()).origin;
    } catch {
      return null;
    }
  };
  const configured = [
    source.DASHBOARD_URL,
    source.SITE_URL,
    source.SITE_FRONTEND_URL,
    ...String(source.CORS_ORIGINS ?? '').split(','),
  ];
  const all = [
    PRODUCTION_DASHBOARD_URL,
    PRODUCTION_SITE_FRONTEND_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    ...configured,
  ]
    .filter((value) => String(value ?? '').trim())
    .map(toOrigin)
    .filter(Boolean);
  return [...new Set(all)];
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  /** "off" skips every cron job (posting, social status, blog). For local servers on the production DB. */
  SCHEDULED_JOBS: process.env.SCHEDULED_JOBS?.trim().toLowerCase() || 'on',
  PORT: Number(process.env.PORT) || 4000,
  MOCK_MODE: truthyEnv('MOCK_MODE'),
  /** Automatic blog posts run unless this is "false" (set it on local machines that share a database). */
  BLOG_AUTOPUBLISH: String(process.env.BLOG_AUTOPUBLISH ?? '').toLowerCase() !== 'false',
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI ?? '',
  GOOGLE_GBP_ACCOUNT_ID: process.env.GOOGLE_GBP_ACCOUNT_ID?.trim() ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? '',
  GHL_API_KEY: process.env.GHL_API_KEY ?? '',
  GHL_LOCATION_ID: process.env.GHL_LOCATION_ID ?? '',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? '',
  ALERT_EMAIL_FROM: process.env.ALERT_EMAIL_FROM ?? '',
  ALERT_EMAIL_TO: process.env.ALERT_EMAIL_TO ?? '',
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_USER: process.env.SMTP_USER ?? '',
  /** Gmail app passwords may include spaces in .env — stripped when used */
  SMTP_PASS: String(process.env.SMTP_PASS ?? '').replace(/\s/g, ''),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  /** llama.cpp server running the AuthorMist rewriter. Unset = posts are not rewritten. */
  AUTHORMIST_URL: process.env.AUTHORMIST_URL?.trim().replace(/\/$/, '') || '',
  /** Sent as X-Authormist-Key; the relay rejects requests without it. Not needed for a local server. */
  AUTHORMIST_KEY: process.env.AUTHORMIST_KEY?.trim() || '',
  PEXELS_API_KEY: process.env.PEXELS_API_KEY ?? '',
  SITE_FRONTEND_URL: process.env.SITE_FRONTEND_URL?.trim() || PRODUCTION_SITE_FRONTEND_URL,
  /** Custom domains are verified by checking their DNS points at this IP. */
  FRONTEND_PUBLIC_IP: process.env.FRONTEND_PUBLIC_IP?.trim() || PRODUCTION_FRONTEND_IP,
  /** Shared with peakwa-sites; no default — cache refresh is skipped when unset. */
  REVALIDATE_SECRET: process.env.REVALIDATE_SECRET?.trim() ?? '',
  corsOrigins: parseCorsOrigins(),
};

const REQUIRED_FOR_API = [
  'DATABASE_URL',
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
];

/**
 * Fail fast on boot if critical secrets / URLs are missing.
 */
export function validateServerEnv() {
  const missing = REQUIRED_FOR_API.filter((key) => !String(process.env[key] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing or empty environment variables: ${missing.join(', ')}. Copy .env and fill all values.`,
    );
  }
}
