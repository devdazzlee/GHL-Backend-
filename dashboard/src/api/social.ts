import api from './client';

export type SocialPostingMode = 'OFF' | 'DRAFT' | 'LIVE';
export type SocialPlatform = 'facebook' | 'instagram';

export interface SocialPlatformStatus {
  enabled: boolean;
  connected: boolean;
  account: { id: string; name: string; type: string } | null;
  lastResult: {
    socialPostId: string;
    sourceType: string;
    sourceId: string;
    mode: SocialPostingMode;
    status: 'SENT' | 'FAILED';
    error?: string;
    ghlChildPostId?: string;
    at: string;
  } | null;
  needsReconnect: boolean;
}

export interface SocialSettings {
  locationId: string;
  socialPostingMode: SocialPostingMode;
  ghlSocialUserId: string | null;
  hasLocationGhlKey: boolean;
  ghlSocialAccountsSyncedAt: string | null;
  platforms: Record<SocialPlatform, SocialPlatformStatus>;
}

export interface SocialSettingsUpdate {
  socialPostingMode?: SocialPostingMode;
  facebookEnabled?: boolean;
  instagramEnabled?: boolean;
  changedBy?: string;
}

export async function fetchSocialSettings(locationId: string): Promise<SocialSettings> {
  const { data } = await api.get<{ data: SocialSettings }>(
    `/locations/${encodeURIComponent(locationId)}/social`,
  );
  return data.data;
}

export async function updateSocialSettings(
  locationId: string,
  body: SocialSettingsUpdate,
): Promise<SocialSettings> {
  const { data } = await api.patch<{ data: SocialSettings }>(
    `/locations/${encodeURIComponent(locationId)}/social`,
    body,
  );
  return data.data;
}
