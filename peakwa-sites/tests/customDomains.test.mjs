import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDomainMap, normalizeHost, routeRequest } from '../src/lib/domainRouting.ts';
import { joinBase, liveDomain, siteBasePath, siteOrigin, sitePath, siteUrl } from '../src/lib/siteUrls.ts';
import { resolveHref } from '../src/lib/blogMarkdown.ts';
import { footerAreaLinks, footerServiceLinks } from '../src/lib/footerLinks.ts';

const PLATFORM = 'https://site.peakwa.com';
const onPlatform = { slug: 'paws', customDomain: null, customDomainVerifiedAt: null };
const pending = { slug: 'paws', customDomain: 'www.pawspines.com', customDomainVerifiedAt: null };
const live = { slug: 'paws', customDomain: 'www.pawspines.com', customDomainVerifiedAt: '2026-09-29T10:00:00Z' };

const map = buildDomainMap([
  { slug: 'paws', domain: 'www.PawsPines.com', live: true },
  { slug: 'coolflow', domain: 'coolflow.com', live: false },
  { slug: '', domain: 'broken.com', live: true },
]);

test('site links stay on the platform until the domain is verified', () => {
  for (const site of [onPlatform, pending]) {
    assert.equal(liveDomain(site), null);
    assert.equal(siteBasePath(site), '/paws');
    assert.equal(sitePath(site), '/paws');
    assert.equal(sitePath(site, '/about'), '/paws/about');
    assert.equal(siteUrl(site, PLATFORM), 'https://site.peakwa.com/paws');
    assert.equal(siteUrl(site, `${PLATFORM}/`, '/sitemap.xml'), 'https://site.peakwa.com/paws/sitemap.xml');
    assert.equal(siteOrigin(site, PLATFORM), PLATFORM);
  }
});

test('once live, links and absolute URLs use the domain', () => {
  assert.equal(liveDomain(live), 'www.pawspines.com');
  assert.equal(siteBasePath(live), '');
  assert.equal(sitePath(live), '/', 'home is "/", never an empty link');
  assert.equal(sitePath(live, '/services/dog-boarding'), '/services/dog-boarding');
  assert.equal(siteUrl(live, PLATFORM), 'https://www.pawspines.com');
  assert.equal(siteUrl(live, PLATFORM, '/blog/tips'), 'https://www.pawspines.com/blog/tips');
  assert.equal(siteOrigin(live, PLATFORM), 'https://www.pawspines.com');
  assert.equal(joinBase(''), '/');
  assert.equal(joinBase('', '/contact'), '/contact');
  assert.equal(joinBase('/paws'), '/paws');
});

test('on the domain, pages are served from the site without the slug in the address', () => {
  assert.deepEqual(routeRequest('www.pawspines.com', '/', '', map), { kind: 'rewrite', path: '/paws', slug: 'paws' });
  assert.deepEqual(routeRequest('WWW.PawsPines.com:443', '/about', '', map), { kind: 'rewrite', path: '/paws/about', slug: 'paws' });
  assert.deepEqual(routeRequest('www.pawspines.com', '/sitemap.xml', '', map), { kind: 'rewrite', path: '/paws/sitemap.xml', slug: 'paws' });
  assert.deepEqual(routeRequest('www.pawspines.com', '/robots.txt', '', map), { kind: 'rewrite', path: '/paws/robots.txt', slug: 'paws' });
  assert.deepEqual(routeRequest('www.pawspines.com', '/services/x', '?a=1', map), { kind: 'rewrite', path: '/paws/services/x', slug: 'paws' });
});

test('an old /{slug}/ link on the domain drops the prefix', () => {
  assert.deepEqual(routeRequest('www.pawspines.com', '/paws/about', '?a=1', map), { kind: 'redirect', location: '/about?a=1' });
  assert.deepEqual(routeRequest('www.pawspines.com', '/paws', '', map), { kind: 'redirect', location: '/' });
  // A page whose name merely starts with the slug is not the prefix.
  assert.deepEqual(routeRequest('www.pawspines.com', '/pawsome-tips', '', map), { kind: 'rewrite', path: '/paws/pawsome-tips', slug: 'paws' });
});

test('an unverified domain is served, but the platform address does not move yet', () => {
  assert.deepEqual(routeRequest('coolflow.com', '/about', '', map), { kind: 'rewrite', path: '/coolflow/about', slug: 'coolflow' });
  assert.equal(routeRequest('site.peakwa.com', '/coolflow/about', '', map), null);
});

test('on the platform, a live site moves to its domain with the same path and query', () => {
  assert.deepEqual(routeRequest('site.peakwa.com', '/paws/services/x', '?utm=a', map), {
    kind: 'redirect',
    location: 'https://www.pawspines.com/services/x?utm=a',
  });
  assert.deepEqual(routeRequest('site.peakwa.com', '/paws', '', map), { kind: 'redirect', location: 'https://www.pawspines.com/' });
  assert.deepEqual(routeRequest('site.peakwa.com', '/PAWS/about', '', map), { kind: 'redirect', location: 'https://www.pawspines.com/about' });
});

test('everything else is left alone', () => {
  for (const path of ['/', '/robots.txt', '/sitemap.xml', '/other-site/about', '/design-preview/3']) {
    assert.equal(routeRequest('site.peakwa.com', path, '', map), null, path);
  }
  assert.equal(routeRequest('unknown-host.com', '/about', '', map), null);
  assert.equal(map.byHost.has('broken.com'), false, 'rows without a slug are ignored');
  assert.equal(normalizeHost(' Site.Peakwa.com.:8080 '), 'site.peakwa.com');
  assert.equal(normalizeHost(null), '');
});

test('links inside blog posts follow the site address', () => {
  assert.equal(resolveHref('services', 'paws', ''), '/services');
  assert.equal(resolveHref('/paws/contact', 'paws', ''), '/contact', 'old /{slug}/ links too');
  assert.equal(resolveHref('/paws', 'paws', ''), '/');
  assert.equal(resolveHref('/paws', 'paws'), '/paws');
  assert.equal(resolveHref('https://example.com/a', 'paws', ''), 'https://example.com/a');
});

test('footer links take the site link prefix (empty on the domain)', () => {
  assert.deepEqual(footerServiceLinks('', { services: [{ title: 'Dog Boarding' }] }), [
    { label: 'Dog Boarding', href: '/services/dog-boarding' },
  ]);
  assert.deepEqual(footerAreaLinks('/paws', [{ id: '1', slug: 'englewood-arapahoe-county', city: 'Englewood' }]), [
    { label: 'Englewood', href: '/paws/englewood-arapahoe-county' },
  ]);
});

test('the www / bare twin of a domain redirects to it, keeping the path', () => {
  assert.deepEqual(routeRequest('pawspines.com', '/about', '?a=1', map), {
    kind: 'redirect',
    location: 'https://www.pawspines.com/about?a=1',
  });
  assert.deepEqual(routeRequest('www.coolflow.com', '/', '', map), { kind: 'redirect', location: 'https://coolflow.com/' });
  // Two sites on acme.com and www.acme.com: each host serves its own site.
  const both = buildDomainMap([
    { slug: 'one', domain: 'acme.com', live: true },
    { slug: 'two', domain: 'www.acme.com', live: true },
  ]);
  assert.deepEqual(routeRequest('www.acme.com', '/', '', both), { kind: 'rewrite', path: '/two', slug: 'two' });
  assert.deepEqual(routeRequest('acme.com', '/', '', both), { kind: 'rewrite', path: '/one', slug: 'one' });
});
