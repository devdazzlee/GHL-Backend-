import { Resolver } from 'node:dns/promises';
import prisma from '../database/client.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { revalidateSiteFrontendCache } from './siteRevalidation.service.js';

/**
 * A site's own domain (e.g. www.acmehvac.com), served by the frontend server's nginx.
 *
 * Setting a domain changes nothing for visitors yet. It goes live only after it is
 * verified: its DNS points at the frontend server and https://{domain} answers for
 * this site. From then on the renderer builds links, canonical URLs and sitemaps on
 * the domain, and site.peakwa.com/{slug}/... answers 301 to https://{domain}/...
 */

const HOST_PATTERN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Hosts that belong to the platform itself (or can never be a client's domain). */
const RESERVED_SUFFIXES = ['peakwa.com', 'vercel.app', 'localhost'];

/** "https://WWW.Acme.com/about" -> "www.acme.com". Empty input -> "". */
export function normalizeDomain(value) {
  let raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  try {
    // Converts international names to their xn-- form.
    return new URL(`http://${raw}`).hostname;
  } catch {
    return raw;
  }
}

export function validateDomain(domain) {
  if (!HOST_PATTERN.test(domain)) {
    throw new AppError('Enter a domain like www.example.com (no https://, no path).', 400, { code: 'INVALID_DOMAIN' });
  }
  if (RESERVED_SUFFIXES.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`))) {
    throw new AppError('That domain belongs to the platform, not to a client.', 400, { code: 'DOMAIN_RESERVED' });
  }
}

/** The www / bare twin that should redirect to the domain: www.acme.com <-> acme.com. Null for deeper subdomains. */
export function alternateDomain(domain) {
  if (!domain) return null;
  if (domain.startsWith('www.')) return domain.slice(4);
  return domain.split('.').length === 2 ? `www.${domain}` : null;
}

/**
 * Record name as most DNS panels show it: "@" for the bare domain, else the part in
 * front of it. Assumes a two-part domain (acme.com); the full host is shown too.
 */
function recordName(host) {
  const zone = host.split('.').slice(-2).join('.');
  return host === zone ? '@' : host.slice(0, -(zone.length + 1));
}

/** The DNS records a client adds for their domain. */
export function dnsRecordsFor(domain, ip = env.FRONTEND_PUBLIC_IP) {
  if (!domain) return [];
  const hosts = [domain, alternateDomain(domain)].filter(Boolean);
  return hosts.map((host) => ({ type: 'A', host, name: recordName(host), value: ip }));
}

/** What the dashboard shows for a site's domain. */
export function domainState(site, ip = env.FRONTEND_PUBLIC_IP) {
  const domain = site.customDomain ?? null;
  const live = Boolean(domain && site.customDomainVerifiedAt);
  return {
    domain,
    alternate: alternateDomain(domain),
    verifiedAt: site.customDomainVerifiedAt ?? null,
    live,
    url: live ? `https://${domain}` : null,
    dnsRecords: dnsRecordsFor(domain, ip),
  };
}

const DOMAIN_SELECT = { id: true, slug: true, customDomain: true, customDomainVerifiedAt: true };

async function getSiteForDomain(siteId) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId }, select: DOMAIN_SELECT });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  return site;
}

export async function getSiteDomain(siteId) {
  return domainState(await getSiteForDomain(siteId));
}

/**
 * Sets (or with an empty value, removes) a site's domain. A new domain always starts
 * unverified, so the site keeps working at site.peakwa.com until it is verified.
 */
export async function setSiteDomain(siteId, requested, { revalidateFn = revalidateSiteFrontendCache } = {}) {
  const domain = normalizeDomain(requested) || null;
  if (domain) validateDomain(domain);

  const site = await getSiteForDomain(siteId);
  if (domain === site.customDomain) return domainState(site);

  if (domain) {
    const alternate = alternateDomain(domain);
    const clash = await prisma.generatedSite.findFirst({
      where: { id: { not: site.id }, customDomain: { in: [domain, alternate].filter(Boolean) } },
      select: { id: true },
    });
    if (clash) {
      throw new AppError('Another site already uses that domain.', 409, { code: 'DOMAIN_TAKEN' });
    }
  }

  let updated;
  try {
    updated = await prisma.generatedSite.update({
      where: { id: site.id },
      data: { customDomain: domain, customDomainVerifiedAt: null },
      select: DOMAIN_SELECT,
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      throw new AppError('Another site already uses that domain.', 409, { code: 'DOMAIN_TAKEN' });
    }
    throw error;
  }

  // A live domain that changed or was removed moves the site's links back to site.peakwa.com.
  await revalidateFn(site.slug);
  console.info(JSON.stringify({ event: 'site_domain_set', siteId: site.id, from: site.customDomain, to: domain }));
  return domainState(updated);
}

const publicResolver = new Resolver({ timeout: 5000, tries: 2 });
publicResolver.setServers(['1.1.1.1', '8.8.8.8']);

async function lookup(resolveFn, host) {
  try {
    return await resolveFn(host);
  } catch (error) {
    if (error?.code === 'ENODATA' || error?.code === 'ENOTFOUND') return [];
    throw error;
  }
}

/** DNS check for one host: every A record must be the frontend server, and no AAAA records. */
export async function checkDns(host, { resolve4, resolve6, expectedIp }) {
  try {
    const [a, aaaa] = await Promise.all([lookup(resolve4, host), lookup(resolve6, host)]);
    let problem = null;
    if (a.length === 0) problem = `No A record yet. Add: A ${host} -> ${expectedIp}`;
    else if (a.some((ip) => ip !== expectedIp)) problem = `A records point at ${a.join(', ')}; they must all be ${expectedIp}. Remove the others.`;
    else if (aaaa.length > 0) problem = `Remove the AAAA (IPv6) records (${aaaa.join(', ')}); the server answers on IPv4 only.`;
    return { host, ok: problem === null, a, aaaa, problem };
  } catch (error) {
    return { host, ok: false, a: [], aaaa: [], problem: `DNS lookup failed: ${error?.code || error?.message || error}` };
  }
}

/** HTTPS check: the renderer on that domain must say it serves this site. */
export async function checkHttps(domain, slug, { fetchFn, timeoutMs = 10000 }) {
  try {
    const res = await fetchFn(`https://${domain}/api/domain-check`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => null);
    const served = data?.data?.slug ?? null;
    if (res.ok && served === slug) return { ok: true, problem: null };
    if (res.ok) {
      return {
        ok: false,
        problem: served
          ? `https://${domain} is serving a different site (${served}).`
          : `https://${domain} answers, but the server doesn't know this domain yet (it can take a minute after saving).`,
      };
    }
    return { ok: false, problem: `https://${domain} answered HTTP ${res.status}. Has the domain been added on the server (nginx + certificate)?` };
  } catch (error) {
    const cause = error?.cause?.code || error?.cause?.message || error?.name || error?.message;
    return {
      ok: false,
      problem: `Could not open https://${domain} (${cause}). The server may not have the domain or its certificate yet.`,
    };
  }
}

/**
 * Checks DNS and HTTPS; when both pass, the domain goes live. A failing check never
 * takes an already-live domain down (it may be a passing network problem).
 */
export async function verifySiteDomain(
  siteId,
  {
    resolve4 = (host) => publicResolver.resolve4(host),
    resolve6 = (host) => publicResolver.resolve6(host),
    fetchFn = fetch,
    expectedIp = env.FRONTEND_PUBLIC_IP,
    revalidateFn = revalidateSiteFrontendCache,
    now = () => new Date(),
  } = {},
) {
  const site = await getSiteForDomain(siteId);
  if (!site.customDomain) {
    throw new AppError('Set a domain for this site first.', 400, { code: 'NO_DOMAIN' });
  }

  const alternate = alternateDomain(site.customDomain);
  const [dns, alternateDns] = await Promise.all([
    checkDns(site.customDomain, { resolve4, resolve6, expectedIp }),
    alternate ? checkDns(alternate, { resolve4, resolve6, expectedIp }) : null,
  ]);
  const https = dns.ok ? await checkHttps(site.customDomain, site.slug, { fetchFn }) : { ok: false, problem: 'Waiting for DNS.' };
  const verified = dns.ok && https.ok;

  let current = site;
  if (verified && !site.customDomainVerifiedAt) {
    current = await prisma.generatedSite.update({
      where: { id: site.id },
      data: { customDomainVerifiedAt: now() },
      select: DOMAIN_SELECT,
    });
    await revalidateFn(site.slug);
    console.info(JSON.stringify({ event: 'site_domain_verified', siteId: site.id, domain: site.customDomain }));
  }

  return { verified, checks: { dns, alternateDns, https }, domain: domainState(current, expectedIp) };
}

/** Every active site's domain, for the renderer (routing and redirects). */
export async function listCustomDomains() {
  const sites = await prisma.generatedSite.findMany({
    where: { status: 'ACTIVE', customDomain: { not: null } },
    select: { slug: true, customDomain: true, customDomainVerifiedAt: true },
  });
  return sites.map((s) => ({ slug: s.slug, domain: s.customDomain, live: Boolean(s.customDomainVerifiedAt) }));
}

/**
 * CORS: live custom domains may call the API (the contact form posts from the
 * visitor's browser). The list is reused for a minute; a failed refresh keeps the
 * last good list.
 */
export function createSiteOriginChecker({ loadFn = listCustomDomains, ttlMs = 60 * 1000, now = () => Date.now() } = {}) {
  let cache = null;
  return async function isAllowedSiteOrigin(origin) {
    if (!origin || !origin.startsWith('https://')) return false;
    if (!cache || now() - cache.at >= ttlMs) {
      try {
        const rows = await loadFn();
        cache = { at: now(), origins: new Set(rows.filter((r) => r.live).map((r) => `https://${r.domain}`)) };
      } catch {
        if (!cache) return false;
      }
    }
    return cache.origins.has(origin.toLowerCase());
  };
}
