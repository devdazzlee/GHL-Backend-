/** Admin API key for /phase4, kept for this browser tab session only (never in the build). */
const STORAGE_KEY = 'peakwa.adminKey';
export const ADMIN_KEY_REQUIRED_EVENT = 'peakwa:admin-key-required';

export function getAdminKey(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAdminKey(key: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    // Storage unavailable: the key can't be remembered for this session.
  }
}

export function clearAdminKey(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
