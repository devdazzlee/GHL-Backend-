import axios from 'axios';
import prisma from '../../src/database/client.js';

export const FB = { id: 'fb-page-1', platform: 'facebook', type: 'page', name: 'Biz FB' };
export const IG = { id: 'ig-1', platform: 'instagram', type: 'profile', name: 'bizig' };
export const GBP = { id: 'gbp-1', platform: 'google', type: 'location', name: 'Biz GBP' };

export const TOKEN_ERROR =
  'Social Account token has expired, been revoked, or is otherwise invalid. Please re-connect your account and ensure the necessary permissions are granted.';

export function makeLocation(overrides = {}) {
  return {
    id: 'loc-1',
    businessId: 'biz-1',
    ghlLocationId: 'ghl-loc-1',
    ghlApiKey: 'pit-test',
    ghlSocialUserId: 'user-1',
    socialPostingMode: 'LIVE',
    socialFacebookEnabled: true,
    socialInstagramEnabled: true,
    ghlSocialAccounts: [FB, IG],
    ghlSocialAccountsSyncedAt: null,
    business: { name: 'Biz' },
    ...overrides,
  };
}

/**
 * Replaces the Prisma calls the social service makes with in-memory versions.
 * Returns the recorded state for assertions.
 */
export function stubPrisma({ location } = {}) {
  const state = {
    location: location ?? makeLocation(),
    socialPosts: new Map(),
    audits: [],
    locationUpdates: [],
  };
  const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);

  prisma.location.findUnique = async () => state.location;
  prisma.location.update = async ({ data }) => {
    state.locationUpdates.push(data);
    Object.assign(state.location, data);
    return state.location;
  };
  prisma.business.findUnique = async () => ({ name: 'Biz' });
  prisma.auditLog.create = async ({ data }) => {
    state.audits.push(data);
    return data;
  };
  prisma.$transaction = async (ops) => Promise.all(ops);

  prisma.socialPost.findUnique = async ({ where }) => {
    const { sourceType, sourceId } = where.sourceType_sourceId;
    return state.socialPosts.get(`${sourceType}:${sourceId}`) ?? null;
  };
  prisma.socialPost.upsert = async ({ where, create, update }) => {
    const key = `${where.sourceType_sourceId.sourceType}:${where.sourceType_sourceId.sourceId}`;
    const existing = state.socialPosts.get(key);
    const row = existing
      ? Object.assign(existing, update)
      : { id: `sp-${state.socialPosts.size + 1}`, createdAt: new Date(), ...create };
    state.socialPosts.set(key, row);
    return row;
  };
  prisma.socialPost.findMany = async () =>
    [...state.socialPosts.values()].sort((a, b) => b.createdAt - a.createdAt);
  prisma.socialPost.update = async ({ where, data }) => {
    const row = [...state.socialPosts.values()].find((r) => r.id === where.id);
    return Object.assign(row, data);
  };
  prisma.socialPost.updateMany = async ({ where, data }) => {
    let count = 0;
    for (const row of state.socialPosts.values()) {
      if (matches(row, where)) {
        Object.assign(row, data);
        count += 1;
      }
    }
    return { count };
  };

  return state;
}

/**
 * Routes axios through a fake GHL. handlers: { getAccounts, createPost, listPosts },
 * each (config, body) => { status, data }. Unhandled calls throw, so no test can
 * reach the real network.
 */
export function stubGhl(handlers = {}) {
  const calls = [];
  axios.defaults.adapter = async (config) => {
    const body = config.data ? JSON.parse(config.data) : undefined;
    calls.push({ method: config.method, url: config.url, body });
    let handler;
    if (config.method === 'get' && config.url.endsWith('/accounts')) handler = handlers.getAccounts;
    else if (config.method === 'post' && config.url.endsWith('/posts/list')) handler = handlers.listPosts;
    else if (config.method === 'post' && config.url.endsWith('/posts')) handler = handlers.createPost;
    if (!handler) throw new Error(`Unexpected GHL call in test: ${config.method} ${config.url}`);
    const { status = 200, data = {} } = await handler(config, body);
    return { status, statusText: String(status), data, headers: {}, config };
  };
  return calls;
}

export const accountsResponse = (accounts) => () => ({
  status: 200,
  data: { results: { accounts } },
});

export const createPostOk = (id = 'ghl-post-1') => () => ({
  status: 201,
  data: { results: { post: { _id: id } } },
});

/** Captures alert "sends" (SMTP is unset in tests, so alerts log as skipped). */
export function captureAlerts() {
  const alerts = [];
  const original = console.warn;
  console.warn = (message, ...rest) => {
    const text = String(message);
    if (text.includes('_alert_skipped')) {
      alerts.push(JSON.parse(text));
      return;
    }
    if (text.includes('social_accounts_')) return;
    original(message, ...rest);
  };
  return { alerts, restore: () => (console.warn = original) };
}

/** Silences the service's JSON info/error logs during tests. */
export function quietLogs() {
  const { info, error } = console;
  console.info = () => {};
  console.error = () => {};
  return () => {
    console.info = info;
    console.error = error;
  };
}
