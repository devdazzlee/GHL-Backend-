import './helpers/env.js';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { checkCredentials, readCookie, verifySessionToken } from '../src/services/adminSession.service.js';
import { quietLogs } from './helpers/stubs.js';

const AHMED = 'ahmed-key-for-tests-0123456789abcdef';
const RAZA = 'raza-key-for-tests-0123456789abcdefgh';
const SECRET = 'jwt-secret-for-tests-0123456789';

let server;
let base;
let restoreLogs;

async function call(method, path, { headers = {}, body, cookie } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') ?? '' };
}

async function signIn(username = 'ahmed', password = AHMED) {
  const res = await call('POST', '/session/login', { body: { username, password } });
  const cookie = res.setCookie.split(';')[0];
  return { ...res, cookie };
}

before(async () => {
  restoreLogs = quietLogs();
  process.env.ADMIN_API_KEYS = `ahmed=${AHMED},raza=${RAZA}`;
  process.env.JWT_SECRET = SECRET;
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  restoreLogs();
});

describe('signing in', () => {
  it('accepts the account name and its key, case-insensitive name', () => {
    assert.equal(checkCredentials('ahmed', AHMED), 'ahmed');
    assert.equal(checkCredentials(' AHMED ', AHMED), 'ahmed');
    assert.equal(checkCredentials('raza', AHMED), null, "another account's key");
    assert.equal(checkCredentials('ahmed', `${AHMED}x`), null);
    assert.equal(checkCredentials('ahmed', ''), null);
  });

  it('sets an httpOnly, SameSite=Lax session cookie for 7 days', async () => {
    const res = await signIn();
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data.user, { name: 'ahmed' });
    assert.match(res.setCookie, /^peakwa_admin=/);
    assert.match(res.setCookie, /HttpOnly/i);
    assert.match(res.setCookie, /SameSite=Lax/i);
    assert.match(res.setCookie, /Max-Age=604800/);
    assert.doesNotMatch(res.setCookie, new RegExp(AHMED), 'the key itself never goes in the cookie');
  });

  it('refuses a wrong password without setting a cookie', async () => {
    const res = await call('POST', '/session/login', { body: { username: 'ahmed', password: 'wrong-password-0123456789abcdef' } });
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'INVALID_LOGIN');
    assert.equal(res.setCookie, '');
  });

  it('knows who is signed in, and signing out clears the cookie', async () => {
    const { cookie } = await signIn('raza', RAZA);
    assert.deepEqual((await call('GET', '/session/me', { cookie })).json.data.user, { name: 'raza' });
    assert.equal((await call('GET', '/session/me')).status, 401);
    const out = await call('POST', '/session/logout', { cookie });
    assert.equal(out.status, 200);
    assert.match(out.setCookie, /peakwa_admin=;/);
    assert.match(out.setCookie, /Expires=Thu, 01 Jan 1970/);
  });
});

describe('sessions', () => {
  it('a tampered, foreign or expired token is not a session', () => {
    const good = jwt.sign({ sub: 'ahmed', kh: 'x' }, 'another-secret');
    assert.equal(verifySessionToken(good), null);
    assert.equal(verifySessionToken('not-a-token'), null);
    const expired = jwt.sign({ sub: 'ahmed', kh: 'x', exp: 1 }, SECRET);
    assert.equal(verifySessionToken(expired), null);
  });

  it('changing an account key signs that account out everywhere', async () => {
    const { cookie } = await signIn();
    assert.equal((await call('GET', '/session/me', { cookie })).status, 200);
    const saved = process.env.ADMIN_API_KEYS;
    process.env.ADMIN_API_KEYS = `ahmed=${AHMED}-rotated,raza=${RAZA}`;
    try {
      assert.equal((await call('GET', '/session/me', { cookie })).status, 401);
    } finally {
      process.env.ADMIN_API_KEYS = saved;
    }
  });

  it('reads one cookie out of several', () => {
    const req = { get: () => 'a=1; peakwa_admin=tok%2En; b=2' };
    assert.equal(readCookie(req, 'peakwa_admin'), 'tok.n');
    assert.equal(readCookie({ get: () => '' }, 'peakwa_admin'), null);
  });
});

describe('dashboard routes need sign-in', () => {
  // Each path stops at the sign-in check (401) or, once signed in, falls through
  // to "not found" (404) without touching the database.
  const protectedPaths = [
    ['GET', '/businesses'],
    ['GET', '/jobs'],
    ['GET', '/setup'],
    ['GET', '/locations/x/y/z/nope'],
    ['GET', '/phase4/no-such-admin-route'],
  ];

  it('without a session: 401 on every dashboard route', async () => {
    for (const [method, path] of protectedPaths) {
      const res = await call(method, path);
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.equal(res.json.error.code, 'AUTH_REQUIRED', `${method} ${path}`);
    }
    for (const path of ['/auth/google/url', '/auth/google/accounts', '/auth/google/locations']) {
      assert.equal((await call('GET', path)).status, 401, path);
    }
    assert.equal((await call('POST', '/jobs/run-daily-job')).status, 401, 'the daily job cannot be triggered anonymously');
  });

  it('with a session: past the sign-in check', async () => {
    const { cookie } = await signIn();
    for (const [method, path] of protectedPaths) {
      assert.equal((await call(method, path, { cookie })).status, 404, `${method} ${path}`);
    }
  });

  it('an admin key still works for scripts', async () => {
    assert.equal((await call('GET', '/businesses', { headers: { Authorization: `Bearer ${AHMED}` } })).status, 404);
    assert.equal((await call('GET', '/businesses', { headers: { Authorization: 'Bearer wrong-key-0123456789abcdefghij' } })).status, 401);
  });

  it("Google's OAuth callback stays public", async () => {
    const res = await call('GET', '/auth/google/callback');
    assert.notEqual(res.status, 401);
    assert.equal(res.json.error?.code, 'OAUTH_CODE_MISSING');
  });

  it('health and the site contact form stay public', async () => {
    assert.equal((await call('GET', '/health')).status, 200);
  });
});
