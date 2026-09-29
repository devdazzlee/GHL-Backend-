import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { revalidateSiteFrontendCache } from './siteRevalidation.service.js';

/**
 * Hand edits to a generated site's page text.
 *
 * An edit is written straight into the page's content JSON (so every reader
 * sees it) and also recorded in GeneratedSite.contentEdits:
 *   { [page]: { [path]: { value, original, anchor, editedAt } } }
 * so it can be re-applied after the content is regenerated, and undone.
 *
 * Pages: home, about, services, contact (GeneratedSite *Content fields),
 * "service:{slug}" (the generated ServicePage for one service), "location:{id}"
 * (a city page) and "keyword:{id}" (a keyword page).
 * Paths are dot paths to a text value, e.g. "hero.heading" or
 * "services.2.shortDescription". Edits under services.N carry the service title
 * as anchor, so after services are reordered or regenerated they land on the
 * same service (or are left out if that service no longer exists).
 */

export const SITE_PAGES = { home: 'homeContent', about: 'aboutContent', services: 'servicesContent', contact: 'contactContent' };
const MAX_VALUE_LENGTH = 20_000;
/** Keys whose values are links, icons, images or styling, not text people read. */
const NON_TEXT_KEY = /(url|href|link|path|slug|icon|image|img|color|colour|style|variant|layout|theme|font)$/i;
const NON_TEXT_EXACT = new Set(['id', 'type', 'key', 'readTime', 'bodyWordCount']);
/** Service titles decide the service page URL, so they are not editable here. */
const READ_ONLY_PATH = /^services\.\d+\.title$/;
const SERVICE_PATH = /^services\.(\d+)\.(.+)$/;

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isServicePageKey(page) {
  return /^service:[a-z0-9-]+$/.test(page);
}

/** Pages stored in their own table, one row each: key prefix -> Prisma model. */
const ROW_PAGES = { service: 'servicePage', location: 'locationPage', keyword: 'keywordPage' };
const ROW_PAGE_KEY = /^(service|location|keyword):([a-z0-9-]+)$/;

function assertPage(page) {
  if (!SITE_PAGES[page] && !ROW_PAGE_KEY.test(page)) {
    throw new AppError('Unknown page.', 404, { code: 'PAGE_NOT_FOUND' });
  }
}

function isTextKey(key) {
  return !NON_TEXT_EXACT.has(key) && !NON_TEXT_KEY.test(key);
}

/** Every editable text value in a page's content, in document order. */
export function editableFields(content) {
  const fields = [];
  const walk = (value, path, key) => {
    if (typeof value === 'string') {
      if (key !== null && isTextKey(key) && value.trim()) fields.push({ path: path.join('.'), value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, [...path, String(i)], key));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (isTextKey(k)) walk(v, [...path, k], k);
      }
    }
  };
  walk(content, [], null);
  return fields;
}

function getAt(obj, path) {
  return path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), obj);
}

function setAt(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  const parent = parts.reduce((node, part) => (node == null ? undefined : node[part]), obj);
  if (parent == null || typeof parent[last] !== 'string') return false;
  parent[last] = value;
  return true;
}

function serviceAnchor(content, path) {
  const match = SERVICE_PATH.exec(path);
  return match ? (getAt(content, `services.${match[1]}.title`) ?? null) : null;
}

/** Where an edit should go now: the same path, or the service that has the anchored title. */
function resolvePath(content, path, anchor) {
  const match = SERVICE_PATH.exec(path);
  if (!match || !anchor) return path;
  const services = Array.isArray(content?.services) ? content.services : [];
  const index = services.findIndex((s) => s?.title === anchor);
  return index === -1 ? null : `services.${index}.${match[2]}`;
}

/** Applies recorded edits to (re)generated content. Pure; returns a new object. */
export function applyRecordedEdits(content, pageEdits) {
  const result = structuredClone(content ?? {});
  for (const [path, edit] of Object.entries(pageEdits ?? {})) {
    const target = resolvePath(result, path, edit?.anchor);
    if (target && typeof edit?.value === 'string') setAt(result, target, edit.value);
  }
  return result;
}

/**
 * For regeneration: takes freshly generated fields ({ homeContent: string, ... })
 * and returns them with the site's recorded edits applied.
 */
export function withRecordedEdits(contentEditsRaw, generatedFields) {
  const edits = parseJson(contentEditsRaw, {});
  const out = { ...generatedFields };
  for (const [page, field] of Object.entries(SITE_PAGES)) {
    if (typeof out[field] !== 'string' || !edits[page]) continue;
    out[field] = JSON.stringify(applyRecordedEdits(parseJson(out[field], {}), edits[page]));
  }
  return out;
}

/**
 * Regeneration keeps the site's services (names, texts, and so their page URLs,
 * hand edits and chosen pictures) unless the industry changed. Everything else
 * on the pages is regenerated.
 */
export function keepServicesOnRegeneration(existing, industry, generatedFields) {
  const sameIndustry =
    String(existing?.industry ?? '').trim().toLowerCase() === String(industry ?? '').trim().toLowerCase();
  if (!sameIndustry) return generatedFields;
  const out = { ...generatedFields };
  for (const field of ['servicesContent', 'homeContent']) {
    const old = parseJson(existing?.[field], {});
    if (typeof out[field] !== 'string' || !Array.isArray(old.services) || old.services.length === 0) continue;
    out[field] = JSON.stringify({ ...parseJson(out[field], {}), services: old.services });
  }
  return out;
}

async function findSite(siteId) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  return site;
}

/**
 * A page's content, and the row it lives in for pages with their own table
 * (row = null for the site's own pages). City and keyword pages are looked up
 * within this site only.
 */
async function loadPage(site, page) {
  if (SITE_PAGES[page]) return { content: parseJson(site[SITE_PAGES[page]], null), row: null };
  const [, kind, key] = ROW_PAGE_KEY.exec(page);
  const row =
    kind === 'service'
      ? await prisma.servicePage.findUnique({ where: { siteId_serviceSlug: { siteId: site.id, serviceSlug: key } } })
      : await prisma[ROW_PAGES[kind]].findFirst({ where: { id: key, siteId: site.id } });
  if (!row && kind !== 'service') throw new AppError('Page not found.', 404, { code: 'PAGE_NOT_FOUND' });
  return { content: row ? parseJson(row.content, null) : null, row };
}

/** Saves a page's content and the site's edit records (plus any other site fields). */
async function writePage(site, page, row, content, nextEdits, siteData = {}) {
  if (row) {
    const model = ROW_PAGES[ROW_PAGE_KEY.exec(page)[1]];
    await prisma[model].update({ where: { id: row.id }, data: { content: JSON.stringify(content) } });
    await prisma.generatedSite.update({ where: { id: site.id }, data: { ...siteData, contentEdits: JSON.stringify(nextEdits) } });
    return;
  }
  await prisma.generatedSite.update({
    where: { id: site.id },
    data: {
      ...(content ? { [SITE_PAGES[page]]: JSON.stringify(content) } : {}),
      ...siteData,
      contentEdits: JSON.stringify(nextEdits),
    },
  });
}

/** The fields shown in the dashboard editor, with which ones were edited by hand. */
export async function getPageEditor(siteId, page) {
  assertPage(page);
  const site = await findSite(siteId);
  const { content, row } = await loadPage(site, page);
  if (!content) {
    return { page, available: false, reason: isServicePageKey(page) && !row ? 'not_generated' : 'empty', fields: [] };
  }
  const edits = parseJson(site.contentEdits, {})[page] ?? {};
  const editedPaths = new Set(
    Object.entries(edits)
      .map(([path, edit]) => resolvePath(content, path, edit?.anchor))
      .filter(Boolean),
  );
  return {
    page,
    available: true,
    fields: editableFields(content).map((f) => ({
      ...f,
      readOnly: READ_ONLY_PATH.test(f.path),
      edited: editedPaths.has(f.path),
    })),
  };
}

function cleanValue(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) throw new AppError('Text cannot be empty.', 400, { code: 'INVALID_EDIT' });
  if (text.length > MAX_VALUE_LENGTH) throw new AppError('Text is too long.', 400, { code: 'INVALID_EDIT' });
  return text;
}

/**
 * Saves edits [{ path, value }] for one page. Only existing, editable text
 * values can change; the structure of the page never does.
 */
export async function savePageEdits(siteId, page, edits) {
  assertPage(page);
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > 500) {
    throw new AppError('Send between 1 and 500 edits.', 400, { code: 'INVALID_EDIT' });
  }
  const site = await findSite(siteId);
  const { content, row } = await loadPage(site, page);
  if (!content) throw new AppError('This page has no content to edit yet.', 409, { code: 'PAGE_NOT_GENERATED' });

  const editable = new Set(editableFields(content).map((f) => f.path));
  const allEdits = parseJson(site.contentEdits, {});
  const pageEdits = { ...(allEdits[page] ?? {}) };
  const home = page === 'services' ? parseJson(site.homeContent, {}) : null;
  const homeEdits = { ...(allEdits.home ?? {}) };
  let homeChanged = false;
  const now = new Date().toISOString();

  for (const edit of edits) {
    const path = String(edit?.path ?? '');
    if (!editable.has(path) || READ_ONLY_PATH.test(path)) {
      throw new AppError(`"${path}" is not an editable text on this page.`, 400, { code: 'INVALID_EDIT' });
    }
    const value = cleanValue(edit.value);
    const current = getAt(content, path);
    if (value === current) continue;
    const anchor = serviceAnchor(content, path);
    pageEdits[path] = { value, original: pageEdits[path]?.original ?? current, anchor, editedAt: now };
    setAt(content, path, value);

    // The home page's service cards repeat each service's short description.
    const match = SERVICE_PATH.exec(path);
    if (home && match && match[2] === 'shortDescription') {
      const homePath = `services.${match[1]}.description`;
      if (getAt(home, `services.${match[1]}.title`) === anchor && typeof getAt(home, homePath) === 'string') {
        homeEdits[homePath] = { value, original: homeEdits[homePath]?.original ?? getAt(home, homePath), anchor, editedAt: now };
        setAt(home, homePath, value);
        homeChanged = true;
      }
    }
  }

  const nextEdits = { ...allEdits, [page]: pageEdits, ...(homeChanged ? { home: homeEdits } : {}) };
  await writePage(site, page, row, content, nextEdits, homeChanged ? { homeContent: JSON.stringify(home) } : {});
  await revalidateSiteFrontendCache(site.slug);
  return getPageEditor(siteId, page);
}

/** Puts one text back to what was generated. */
export async function revertPageEdit(siteId, page, path) {
  assertPage(page);
  const site = await findSite(siteId);
  const allEdits = parseJson(site.contentEdits, {});
  const edit = allEdits[page]?.[path];
  if (!edit) throw new AppError('No edit to undo for that text.', 404, { code: 'EDIT_NOT_FOUND' });
  const { content, row } = await loadPage(site, page);
  const target = content ? resolvePath(content, path, edit.anchor) : null;
  if (target && typeof edit.original === 'string') setAt(content, target, edit.original);
  const pageEdits = { ...allEdits[page] };
  delete pageEdits[path];
  const nextEdits = { ...allEdits, [page]: pageEdits };
  await writePage(site, page, row, content, nextEdits);
  await revalidateSiteFrontendCache(site.slug);
  return getPageEditor(siteId, page);
}

/** For a (re)generated service page: the site's recorded edits for it, applied. */
export function withServicePageEdits(contentEditsRaw, serviceSlug, content) {
  const edits = parseJson(contentEditsRaw, {})[`service:${serviceSlug}`];
  return edits ? applyRecordedEdits(content, edits) : content;
}
