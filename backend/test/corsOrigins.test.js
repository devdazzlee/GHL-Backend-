import './helpers/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCorsOrigins } from '../src/config/env.js';

describe('trusted browser origins (CORS + Google-connect return)', () => {
  it('has the production dashboard and sites and local dev built in, and no Vercel address', () => {
    const origins = parseCorsOrigins({});
    assert.deepEqual(origins, [
      'https://dashboard.peakwa.com',
      'https://site.peakwa.com',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
    ]);
    assert.equal(origins.some((o) => o.includes('vercel.app')), false);
  });

  it('adds DASHBOARD_URL, SITE_URL, SITE_FRONTEND_URL and CORS_ORIGINS as clean origins, without duplicates', () => {
    const origins = parseCorsOrigins({
      DASHBOARD_URL: 'https://dashboard.peakwa.com/',
      SITE_URL: 'https://site.peakwa.com/some/path',
      SITE_FRONTEND_URL: 'https://staging-sites.example.com/',
      CORS_ORIGINS: ' https://a.example , https://b.example/ ,not a url,',
    });
    assert.deepEqual(origins.slice(5), ['https://staging-sites.example.com', 'https://a.example', 'https://b.example']);
    assert.equal(new Set(origins).size, origins.length);
  });
});
