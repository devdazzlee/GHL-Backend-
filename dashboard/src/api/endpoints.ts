import { applyLocationMapping } from '../config/locations';
import api from './client';
import type { Location, LocationSummary, PendingPostItem } from '../types/location';
import type {
  ApiResponse,
  DailyJobResult,
  GhlFieldSetupResult,
  LocationSchedule,
  MediaRecord,
  PaginatedPostsResponse,
  Post,
} from '../types';

export async function fetchLocations(): Promise<Location[]> {
  const { data } = await api.get<ApiResponse<{ locations: Location[] }>>('/locations');
  return data.data.locations.map(applyLocationMapping);
}

// ——— Add Business flow ———

export interface Business {
  id: string;
  name: string;
  category: string | null;
  ghlAccountId: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface CreatedLocation {
  id: string;
  businessId: string;
  ghlLocationId: string;
  city: string | null;
  timezone: string;
  status: string;
  googleAccountId: string | null;
  googleLocationId: string | null;
}

export interface CreateBusinessPayload {
  name: string;
  category?: string | null;
  city?: string | null;
  timezone?: string;
  postDays?: string[];
  postTime?: string;
}

export interface CreateBusinessResult {
  business: Business;
  location: CreatedLocation;
}

export async function createBusiness(
  payload: CreateBusinessPayload,
): Promise<CreateBusinessResult> {
  const { data } = await api.post<ApiResponse<CreateBusinessResult>>('/businesses', payload);
  return data.data;
}

export async function deleteBusiness(
  businessId: string,
): Promise<{ id: string; name: string }> {
  const { data } = await api.delete<ApiResponse<{ id: string; name: string }>>(
    `/businesses/${businessId}`,
  );
  return data.data;
}

export async function getGoogleAuthUrl(locationId: string): Promise<string> {
  const { data } = await api.get<ApiResponse<{ url: string }>>('/auth/google/url', {
    params: { state: locationId },
  });
  return data.data.url;
}

export interface GoogleAccount {
  accountId: string;
  name: string | null;
}

export async function fetchGoogleAccounts(locationId: string): Promise<GoogleAccount[]> {
  const { data } = await api.get<ApiResponse<{ accounts: GoogleAccount[] }>>(
    '/auth/google/accounts',
    { params: { locationId } },
  );
  return data.data.accounts;
}

export interface GoogleGbpLocation {
  name: string | null;
  title: string | null;
  locationId: string | null;
}

export async function fetchGoogleLocations(
  locationId: string,
  accountId: string,
): Promise<GoogleGbpLocation[]> {
  const { data } = await api.get<ApiResponse<{ locations: GoogleGbpLocation[] }>>(
    '/auth/google/locations',
    { params: { locationId, accountId } },
  );
  return data.data.locations;
}

export async function saveGoogleLocation(
  locationId: string,
  payload: { googleAccountId: string; googleLocationId: string },
): Promise<{ id: string; googleAccountId: string | null; googleLocationId: string | null }> {
  const { data } = await api.patch<
    ApiResponse<{ id: string; googleAccountId: string | null; googleLocationId: string | null }>
  >(`/locations/${locationId}/google-location`, payload);
  return data.data;
}

export async function fetchLocationSummaries(): Promise<LocationSummary[]> {
  const { data } = await api.get<ApiResponse<{ summaries: LocationSummary[] }>>(
    '/locations/summary',
  );
  return data.data.summaries.map(applyLocationMapping);
}

export async function fetchPendingPosts(): Promise<PendingPostItem[]> {
  const { data } = await api.get<ApiResponse<{ posts: PendingPostItem[]; total: number }>>(
    '/locations/pending-posts',
  );
  return data.data.posts;
}

export async function fetchPosts(locationId: string): Promise<Post[]> {
  const { data } = await api.get<ApiResponse<{ posts: Post[] }>>(
    `/locations/${locationId}/posts`,
  );
  return data.data.posts;
}

export async function fetchPostsPaginated(
  locationId: string,
  page: number,
  limit: number,
): Promise<PaginatedPostsResponse> {
  const { data } = await api.get<
    ApiResponse<{ posts: Post[]; pagination: PaginatedPostsResponse['pagination'] }>
  >(`/locations/${locationId}/posts`, {
    params: { page, limit },
  });

  return {
    posts: data.data.posts,
    pagination: data.data.pagination,
  };
}

export interface PostWritePayload {
  type: string;
  content: string;
  mediaUrl?: string | null;
  scheduledAt?: string | null;
}

export async function publishPost(
  locationId: string,
  payload: PostWritePayload,
): Promise<Post> {
  const { data } = await api.post<ApiResponse<Post>>(
    `/locations/${locationId}/posts/publish`,
    payload,
  );
  return data.data;
}

export async function approvePost(locationId: string, postId: string): Promise<Post> {
  const { data } = await api.post<ApiResponse<Post>>(
    `/locations/${locationId}/posts/${postId}/approve`,
  );
  return data.data;
}

export async function rejectPost(locationId: string, postId: string): Promise<Post> {
  const { data } = await api.post<ApiResponse<Post>>(
    `/locations/${locationId}/posts/${postId}/reject`,
  );
  return data.data;
}

export async function runDailyJob(): Promise<DailyJobResult> {
  const { data } = await api.post<ApiResponse<DailyJobResult>>(
    '/jobs/run-daily-job',
    {},
    { timeout: 300000 },
  );
  return data.data;
}

export async function setupGhlFields(): Promise<GhlFieldSetupResult[]> {
  const { data } = await api.post<ApiResponse<{ results: GhlFieldSetupResult[] }>>(
    '/setup/ghl-fields',
    {},
    { timeout: 120000 },
  );
  return data.data.results;
}

export async function fetchMedia(locationId: string): Promise<MediaRecord[]> {
  const { data } = await api.get<ApiResponse<{ media: MediaRecord[] }>>(
    `/locations/${locationId}/media`,
  );
  return data.data.media;
}

export async function deleteMedia(
  locationId: string,
  mediaId: string,
): Promise<{ deleted: boolean; mediaId: string }> {
  const { data } = await api.delete<
    ApiResponse<{ deleted: boolean; mediaId: string }>
  >(`/locations/${locationId}/media/${mediaId}`);
  return data.data;
}

export async function uploadMedia(
  locationId: string,
  file: File,
  postType: string,
): Promise<{ url: string; media: MediaRecord }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('postType', postType);

  const { data } = await api.post<
    ApiResponse<{ url: string; media: MediaRecord }>
  >(`/locations/${locationId}/media/upload`, formData);
  return data.data;
}

export async function fetchPost(locationId: string, postId: string): Promise<Post> {
  const { data } = await api.get<ApiResponse<Post>>(
    `/locations/${locationId}/posts/${postId}`,
  );
  return data.data;
}

export async function updatePost(
  locationId: string,
  postId: string,
  payload: PostWritePayload,
): Promise<Post> {
  const { data } = await api.patch<ApiResponse<Post>>(
    `/locations/${locationId}/posts/${postId}`,
    payload,
  );
  return data.data;
}

export async function deletePost(
  locationId: string,
  postId: string,
): Promise<{ deleted: boolean; postId: string }> {
  const { data } = await api.delete<
    ApiResponse<{ deleted: boolean; postId: string }>
  >(`/locations/${locationId}/posts/${postId}`);
  return data.data;
}

export async function updateLocationServiceTowns(
  locationId: string,
  towns: string[],
): Promise<string[]> {
  const { data } = await api.patch<ApiResponse<{ serviceAreaTowns: string[] }>>(
    `/locations/${locationId}/service-towns`,
    { towns },
  );
  return data.data.serviceAreaTowns;
}

export interface OfferConfigPayload {
  couponCode: string;
  terms: string;
  redeemUrl: string;
}

export interface OfferConfig {
  offerCouponCode: string | null;
  offerTerms: string | null;
  offerRedeemUrl: string | null;
}

export async function updateLocationOfferConfig(
  locationId: string,
  payload: OfferConfigPayload,
): Promise<OfferConfig> {
  const { data } = await api.patch<ApiResponse<OfferConfig>>(
    `/locations/${locationId}/offer-config`,
    payload,
  );
  return data.data;
}

export async function updateLocationMaxPostLength(
  locationId: string,
  maxPostLength: number,
): Promise<number> {
  const { data } = await api.patch<ApiResponse<{ id: string; maxPostLength: number }>>(
    `/locations/${locationId}/post-length`,
    { maxPostLength },
  );
  return data.data.maxPostLength;
}

export async function fetchLocationSchedule(
  locationId: string,
): Promise<LocationSchedule> {
  const { data } = await api.get<ApiResponse<{ schedule: LocationSchedule }>>(
    `/locations/${locationId}/schedule`,
  );
  return data.data.schedule;
}

export interface LocationSchedulePayload {
  postsPerWeek: number;
  postDays: string[];
  postTime: string;
  postTypes: string[];
  postDayTypes: Record<string, string>;
  postDayTimes: Record<string, string>;
  timezone: string;
}

export async function updateLocationSchedule(
  locationId: string,
  payload: LocationSchedulePayload,
): Promise<LocationSchedule> {
  const { data } = await api.put<ApiResponse<{ schedule: LocationSchedule }>>(
    `/locations/${locationId}/schedule`,
    payload,
  );
  return data.data.schedule;
}

// ——— Phase 4: Website generation ———

export type SiteStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE';

export interface Phase4Template {
  id: string;
  name: string;
  industry: string;
  slug: string;
  description: string | null;
  previewImage: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Phase4TemplatePayload {
  name: string;
  industry: string;
  slug: string;
  description?: string | null;
  previewImage?: string | null;
}

export interface Phase4LocationPage {
  id: string;
  siteId: string;
  city: string;
  county: string;
  state: string;
  slug: string;
  content: string | null;
  createdAt: string;
}

export interface Phase4GeneratedSite {
  id: string;
  businessName: string;
  industry: string;
  city: string;
  state: string;
  phone: string | null;
  email: string | null;
  description: string | null;
  slug: string;
  templateId: string;
  template?: Phase4Template;
  homeContent: string | null;
  aboutContent: string | null;
  servicesContent: string | null;
  contactContent: string | null;
  blogContent: string | null;
  status: SiteStatus;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  heroStyle?: string;
  fontStyle?: string;
  designVariant?: number;
  yearsInBusiness?: string | null;
  customersServed?: string | null;
  projectsCompleted?: string | null;
  theme?: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    heroStyle: string;
    fontStyle: string;
  };
  locationPages?: Phase4LocationPage[];
  createdAt: string;
  updatedAt: string;
  _count?: { locationPages: number };
}

export interface Phase4SitePayload {
  businessName: string;
  industry: string;
  city: string;
  state?: string;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
}

export interface Phase4LocationInput {
  city: string;
  county: string;
  state?: string;
}

export interface Phase4SiteUpdatePayload {
  businessName?: string;
  industry?: string;
  city?: string;
  state?: string;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  heroStyle?: 'dark' | 'light';
  fontStyle?: 'modern' | 'classic' | 'friendly';
  designVariant?: number;
  yearsInBusiness?: string | null;
  customersServed?: string | null;
  projectsCompleted?: string | null;
  status?: SiteStatus;
}

export async function fetchPhase4TemplatesPaginated(
  query: { page?: number; limit?: number; search?: string } = {},
): Promise<{ templates: Phase4Template[]; pagination: Phase4SitesPagination }> {
  const { data } = await api.get<
    ApiResponse<{ templates: Phase4Template[]; pagination: Phase4SitesPagination }>
  >('/phase4/templates', {
    params: {
      page: query.page ?? 1,
      limit: query.limit ?? 12,
      ...(query.search ? { search: query.search } : {}),
    },
  });
  return {
    templates: data.data.templates,
    pagination: data.data.pagination,
  };
}

export async function fetchPhase4Templates(): Promise<Phase4Template[]> {
  const { templates } = await fetchPhase4TemplatesPaginated({ page: 1, limit: 100 });
  return templates;
}

export async function createPhase4Template(
  payload: Phase4TemplatePayload,
): Promise<Phase4Template> {
  const { data } = await api.post<ApiResponse<{ template: Phase4Template }>>(
    '/phase4/templates',
    payload,
  );
  return data.data.template;
}

export async function updatePhase4Template(
  id: string,
  payload: Partial<Phase4TemplatePayload>,
): Promise<Phase4Template> {
  const { data } = await api.put<ApiResponse<{ template: Phase4Template }>>(
    `/phase4/templates/${id}`,
    payload,
  );
  return data.data.template;
}

export async function deletePhase4Template(id: string): Promise<Phase4Template> {
  const { data } = await api.delete<ApiResponse<{ template: Phase4Template }>>(
    `/phase4/templates/${id}`,
  );
  return data.data.template;
}

export interface Phase4SitesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Phase4SitesQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: SiteStatus | '';
}

export interface PaginatedPhase4SitesResponse {
  sites: Phase4GeneratedSite[];
  pagination: Phase4SitesPagination;
}

export async function fetchPhase4SitesPaginated(
  query: Phase4SitesQuery = {},
): Promise<PaginatedPhase4SitesResponse> {
  const { data } = await api.get<
    ApiResponse<{ sites: Phase4GeneratedSite[]; pagination: Phase4SitesPagination }>
  >('/phase4/sites', {
    params: {
      page: query.page ?? 1,
      limit: query.limit ?? 12,
      ...(query.search ? { search: query.search } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
  });
  return {
    sites: data.data.sites,
    pagination: data.data.pagination,
  };
}

export async function fetchPhase4Sites(): Promise<Phase4GeneratedSite[]> {
  const { sites } = await fetchPhase4SitesPaginated({ page: 1, limit: 100 });
  return sites;
}

export async function fetchPhase4Site(slug: string): Promise<Phase4GeneratedSite> {
  const { data } = await api.get<ApiResponse<{ site: Phase4GeneratedSite }>>(
    `/phase4/sites/${encodeURIComponent(slug)}`,
  );
  return data.data.site;
}

export async function createPhase4Site(
  payload: Phase4SitePayload,
): Promise<Phase4GeneratedSite> {
  const { data } = await api.post<
    ApiResponse<{ slug: string; site: Phase4GeneratedSite }>
  >('/phase4/webhook', payload, { timeout: 300000 });
  return data.data.site;
}

export async function addLocationPages(
  siteId: string,
  locations: Phase4LocationInput[],
): Promise<Phase4LocationPage[]> {
  const { data } = await api.post<ApiResponse<{ pages: Phase4LocationPage[] }>>(
    `/phase4/sites/${siteId}/location-pages`,
    { locations },
    { timeout: 300000 },
  );
  return data.data.pages;
}

export async function addLocationPagesByRadius(
  siteId: string,
  payload: { zipCode: string; radiusMiles: number; maxLocations?: number },
): Promise<Phase4LocationPage[]> {
  const { data } = await api.post<ApiResponse<{ pages: Phase4LocationPage[] }>>(
    `/phase4/sites/${siteId}/location-pages/by-radius`,
    payload,
    { timeout: 300000 },
  );
  return data.data.pages;
}

export async function deletePhase4Site(id: string): Promise<{ message: string; siteId: string }> {
  const { data } = await api.delete<
    ApiResponse<{ message: string; siteId: string }>
  >(`/phase4/sites/${id}`);
  return data.data;
}

export async function updatePhase4Site(
  id: string,
  payload: Phase4SiteUpdatePayload,
): Promise<Phase4GeneratedSite> {
  const { data } = await api.patch<ApiResponse<{ site: Phase4GeneratedSite }>>(
    `/phase4/sites/${id}`,
    payload,
    { timeout: 300000 },
  );
  return data.data.site;
}

export async function regeneratePhase4Site(id: string): Promise<Phase4GeneratedSite> {
  const { data } = await api.post<ApiResponse<{ site: Phase4GeneratedSite }>>(
    `/phase4/sites/${id}/regenerate`,
    {},
    { timeout: 300000 },
  );
  return data.data.site;
}

export interface Phase4ServicePayload {
  title: string;
  shortDescription: string;
  fullDescription: string;
  icon: string;
}

export async function addPhase4Service(
  id: string,
  data: Phase4ServicePayload,
): Promise<Phase4GeneratedSite> {
  const { data: response } = await api.post<ApiResponse<{ site: Phase4GeneratedSite }>>(
    `/phase4/sites/${id}/services`,
    data,
  );
  return response.data.site;
}

export async function deletePhase4Service(
  id: string,
  serviceIndex: number,
): Promise<Phase4GeneratedSite> {
  const { data } = await api.delete<ApiResponse<{ site: Phase4GeneratedSite }>>(
    `/phase4/sites/${id}/services/${serviceIndex}`,
  );
  return data.data.site;
}

export interface IndustrySchema {
  id: string;
  industry: string;
  displayName: string;
  systemPrompt: string;
  homePageSchema: string;
  aboutPageSchema: string;
  servicesPageSchema: string;
  contactPageSchema: string;
  locationPageSchema: string;
  blogPageSchema: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IndustrySchemaPayload {
  industry: string;
  displayName: string;
  systemPrompt: string;
  homePageSchema: string;
  aboutPageSchema: string;
  servicesPageSchema: string;
  contactPageSchema: string;
  locationPageSchema: string;
  blogPageSchema: string;
  isDefault?: boolean;
}

export interface ContactSubmission {
  id: string;
  siteId: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  createdAt: string;
  site?: {
    businessName: string;
    slug: string;
  };
}

export async function fetchIndustrySchemasPaginated(
  query: {
    page?: number;
    limit?: number;
    search?: string;
    default?: 'all' | 'default' | 'non-default';
  } = {},
): Promise<{ schemas: IndustrySchema[]; pagination: Phase4SitesPagination }> {
  const { data } = await api.get<
    ApiResponse<{ schemas: IndustrySchema[]; pagination: Phase4SitesPagination }>
  >('/phase4/industry-schemas', {
    params: {
      page: query.page ?? 1,
      limit: query.limit ?? 12,
      ...(query.search ? { search: query.search } : {}),
      ...(query.default && query.default !== 'all' ? { default: query.default } : {}),
    },
  });
  return {
    schemas: data.data.schemas,
    pagination: data.data.pagination,
  };
}

export async function fetchIndustrySchemas(): Promise<IndustrySchema[]> {
  const { schemas } = await fetchIndustrySchemasPaginated({ page: 1, limit: 100 });
  return schemas;
}

export async function createIndustrySchema(
  payload: IndustrySchemaPayload,
): Promise<IndustrySchema> {
  const { data } = await api.post<ApiResponse<{ schema: IndustrySchema }>>(
    '/phase4/industry-schemas',
    payload,
  );
  return data.data.schema;
}

export async function updateIndustrySchema(
  id: string,
  payload: Partial<IndustrySchemaPayload>,
): Promise<IndustrySchema> {
  const { data } = await api.put<ApiResponse<{ schema: IndustrySchema }>>(
    `/phase4/industry-schemas/${id}`,
    payload,
  );
  return data.data.schema;
}

export async function deleteIndustrySchema(id: string): Promise<IndustrySchema> {
  const { data } = await api.delete<ApiResponse<{ schema: IndustrySchema }>>(
    `/phase4/industry-schemas/${id}`,
  );
  return data.data.schema;
}

export async function fetchContactsPaginated(
  query: { page?: number; limit?: number; search?: string } = {},
): Promise<{
  contacts: ContactSubmission[];
  total: number;
  pagination: Phase4SitesPagination;
}> {
  const { data } = await api.get<
    ApiResponse<{
      contacts: ContactSubmission[];
      total: number;
      pagination: Phase4SitesPagination;
    }>
  >('/phase4/contacts', {
    params: {
      page: query.page ?? 1,
      limit: query.limit ?? 12,
      ...(query.search ? { search: query.search } : {}),
    },
  });
  return data.data;
}

export async function fetchAllContacts(): Promise<{
  contacts: ContactSubmission[];
  total: number;
}> {
  const { contacts, total } = await fetchContactsPaginated({ page: 1, limit: 100 });
  return { contacts, total };
}

export async function fetchSiteContacts(slug: string): Promise<{
  contacts: ContactSubmission[];
  total: number;
}> {
  const { data } = await api.get<
    ApiResponse<{ contacts: ContactSubmission[]; total: number }>
  >(`/phase4/sites/${encodeURIComponent(slug)}/contacts`);
  return data.data;
}

export async function deleteContactSubmission(id: string): Promise<void> {
  await api.delete<ApiResponse<{ message: string; id: string }>>(`/phase4/contacts/${id}`);
}
