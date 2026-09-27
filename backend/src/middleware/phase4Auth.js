import { createHash, timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

/**
 * Access control for /phase4.
 *
 * Roles and where their keys come from (environment only, never code):
 *   admin    ADMIN_API_KEYS="raza=<key>,richie=<key>"  full access (dashboard)
 *   renderer SITE_RENDERER_API_KEY=<key>               read-only site endpoints (peakwa-sites)
 *   webhook  WEBHOOK_API_KEY=<key>                     POST /webhook only (order form);
 *                                                      if unset, /webhook stays public as today
 *
 * Public without a key: POST /sites/:slug/contact (visitor contact form).
 * Keys are compared in constant time against every configured key. If no
 * admin key is configured, admin routes fail closed with 503.
 */

const RENDERER_GET_ROUTES = [
  /^\/indexable-sites\/?$/,
  /^\/sites\/?$/,
  /^\/sites\/[^/]+\/?$/,
  /^\/sites\/[^/]+\/location-pages\/?$/,
  /^\/sites\/[^/]+\/images\/?$/,
  /^\/sites\/[^/]+\/services\/[^/]+\/?$/,
];

const PUBLIC_ROUTES = [{ method: 'POST', path: /^\/sites\/[^/]+\/contact\/?$/ }];

function digest(value) {
  return createHash('sha256').update(String(value), 'utf8').digest();
}

/** Parses "label=key,label2=key2" (labels optional). Keys under 24 chars are ignored. */
export function parseAdminKeys(raw = process.env.ADMIN_API_KEYS) {
  return String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const eq = entry.indexOf('=');
      const label = eq > 0 ? entry.slice(0, eq).trim() : `key${index + 1}`;
      const key = eq > 0 ? entry.slice(eq + 1).trim() : entry;
      return { label, key };
    })
    .filter(({ key }) => key.length >= 24);
}

/** Constant-time match against every candidate; returns the matching label or null. */
export function matchKey(provided, candidates) {
  if (!provided) return null;
  const providedDigest = digest(provided);
  let matched = null;
  for (const candidate of candidates) {
    // Compare every candidate (no early exit) so timing doesn't reveal which matched.
    if (timingSafeEqual(providedDigest, digest(candidate.key)) && matched === null) {
      matched = candidate.label;
    }
  }
  return matched;
}

function bearer(req) {
  const header = String(req.get('authorization') ?? '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

export function classifyRequest(method, path) {
  if (PUBLIC_ROUTES.some((r) => r.method === method && r.path.test(path))) return 'public';
  if (method === 'POST' && /^\/webhook\/?$/.test(path)) return 'webhook';
  if (method === 'GET' && RENDERER_GET_ROUTES.some((r) => r.test(path))) return 'renderer-readable';
  return 'admin';
}

/** Resolves the caller's role from the request credentials. */
export function resolveRole(req) {
  const adminKeys = parseAdminKeys();
  const token = bearer(req);
  const adminLabel = matchKey(token, adminKeys);
  if (adminLabel) return { role: 'admin', label: adminLabel };

  const rendererKey = process.env.SITE_RENDERER_API_KEY?.trim();
  const rendererProvided = String(req.get('x-site-api-key') ?? '').trim() || token;
  if (rendererKey && rendererKey.length >= 24 && matchKey(rendererProvided, [{ label: 'renderer', key: rendererKey }])) {
    return { role: 'renderer', label: 'renderer' };
  }

  const webhookKey = process.env.WEBHOOK_API_KEY?.trim();
  const webhookProvided =
    String(req.get('x-webhook-key') ?? '').trim() || String(req.query?.key ?? '').trim() || token;
  if (webhookKey && webhookKey.length >= 24 && matchKey(webhookProvided, [{ label: 'webhook', key: webhookKey }])) {
    return { role: 'webhook', label: 'webhook' };
  }
  return null;
}

/** Counts only failed attempts, so valid callers are never throttled by it. */
const failedAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'AUTH_RATE_LIMITED', message: 'Too many failed authentication attempts. Try again later.' },
  },
});

function authCheck(req, res, next) {
  const kind = classifyRequest(req.method, req.path);
  if (kind === 'public') return next();

  if (kind === 'webhook' && !process.env.WEBHOOK_API_KEY?.trim()) {
    // Backwards compatible until the order form sends a key.
    return next();
  }

  const caller = resolveRole(req);
  if (caller) req.auth = caller;

  const allowed =
    caller &&
    (caller.role === 'admin' ||
      (caller.role === 'renderer' && kind === 'renderer-readable') ||
      (caller.role === 'webhook' && kind === 'webhook'));
  if (allowed) {
    res.locals.authOk = true;
    return next();
  }

  if (kind === 'admin' && parseAdminKeys().length === 0) {
    return next(new AppError('Admin API keys are not configured on the server.', 503, { code: 'AUTH_NOT_CONFIGURED' }));
  }
  const hasCredentials = Boolean(bearer(req) || req.get('x-site-api-key') || req.get('x-webhook-key') || req.query?.key);
  if (caller) {
    return next(new AppError('This key is not allowed to use this endpoint.', 403, { code: 'AUTH_FORBIDDEN' }));
  }
  return next(
    new AppError(hasCredentials ? 'Invalid API key.' : 'Authentication required.', 401, {
      code: hasCredentials ? 'AUTH_INVALID' : 'AUTH_REQUIRED',
    }),
  );
}

/** Mount before the /phase4 router: rate-limits failures, then checks the key. */
export const phase4Auth = [
  (req, res, next) => {
    if (classifyRequest(req.method, req.path) === 'public') return next();
    return failedAuthLimiter(req, res, next);
  },
  authCheck,
];
