import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackendUnavailableError, isBuildPhase, lookupResult } from '../src/lib/backendLookup.ts';

const URL = 'https://backend.example/phase4/sites/paws';
const response = (status) => new Response('{}', { status });

test('a found lookup returns the response', () => {
  const res = response(200);
  assert.equal(lookupResult(URL, res, { build: false }), res);
});

test('only a real 404 means not found', () => {
  assert.equal(lookupResult(URL, response(404), { build: false }), null);
});

test('a backend error, auth failure, rate limit or no response throws at runtime', () => {
  for (const res of [response(500), response(502), response(503), response(401), response(403), response(429), null]) {
    assert.throws(() => lookupResult(URL, res, { build: false }), BackendUnavailableError);
  }
});

test('the error says which lookup failed and why', () => {
  assert.throws(() => lookupResult(URL, response(503), { build: false }), /sites\/paws \(HTTP 503\)/);
  assert.throws(() => lookupResult(URL, null, { build: false }), /\(no response\)/);
});

test('during the build a failure returns null so the deploy never fails', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.equal(lookupResult(URL, response(503), { build: true }), null);
  assert.equal(lookupResult(URL, null, { build: true }), null);
});

test('build phase is detected from NEXT_PHASE', () => {
  assert.equal(isBuildPhase({ NEXT_PHASE: 'phase-production-build' }), true);
  assert.equal(isBuildPhase({ NEXT_PHASE: 'phase-production-server' }), false);
  assert.equal(isBuildPhase({}), false);
});
