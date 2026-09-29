import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { matchKey, parseAdminKeys } from '../middleware/phase4Auth.js';

/**
 * Dashboard sign-in. The accounts are the ADMIN_API_KEYS entries: the label is the
 * username and the key is the password ("ahmed=<key>" signs in as ahmed).
 *
 * A successful sign-in sets an httpOnly session cookie (7 days). The session is tied
 * to the key it was made with: changing or removing that key in ADMIN_API_KEYS signs
 * the person out everywhere on their next request.
 */

export const SESSION_COOKIE = 'peakwa_admin';
export const SESSION_DAYS = 7;

function keyHash(key) {
  return createHash('sha256').update(String(key), 'utf8').digest('hex').slice(0, 16);
}

/** Read when used, like ADMIN_API_KEYS (dotenv has already loaded it into process.env). */
function secret() {
  return String(process.env.JWT_SECRET ?? '').trim();
}

/** True when sign-in can work at all (accounts and a signing secret are configured). */
export function signInConfigured() {
  return parseAdminKeys().length > 0 && secret().length > 0;
}

/** The account label for a correct username + password, else null. */
export function checkCredentials(username, password) {
  const accounts = parseAdminKeys();
  const label = matchKey(String(password ?? ''), accounts);
  if (!label) return null;
  return label.toLowerCase() === String(username ?? '').trim().toLowerCase() ? label : null;
}

export function createSessionToken(label) {
  const account = parseAdminKeys().find((a) => a.label === label);
  if (!account || !secret()) return null;
  return jwt.sign({ sub: label, kh: keyHash(account.key) }, secret(), {
    expiresIn: `${SESSION_DAYS}d`,
    algorithm: 'HS256',
  });
}

/** The signed-in account for a session token, or null (expired, tampered, or key changed). */
export function verifySessionToken(token) {
  if (!token || !secret()) return null;
  try {
    const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] });
    const account = parseAdminKeys().find((a) => a.label === payload.sub);
    if (!account || keyHash(account.key) !== payload.kh) return null;
    return { label: account.label };
  } catch {
    return null;
  }
}

/** One cookie's value from the Cookie header (no cookie-parser dependency). */
export function readCookie(req, name) {
  const header = String(req.get?.('cookie') ?? req.headers?.cookie ?? '');
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The account signed in on this request (session cookie), or null. */
export function sessionFromRequest(req) {
  return verifySessionToken(readCookie(req, SESSION_COOKIE));
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    // dashboard.peakwa.com -> backend.peakwa.com is same-site, so Lax is sent with API calls
    // but not with cross-site form posts. Secure only in production (local dev is plain http).
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}
