/** Backend base URL (baked into release builds). Override via EXPO_PUBLIC_API_BASE_URL. */
export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  'https://companion-production-850d.up.railway.app';

export function resolvedApiBaseUrl(): string {
  const trimmed = apiBaseUrl.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/\/+$/, '');
}

export function isProductionApi(): boolean {
  const url = resolvedApiBaseUrl();
  return url.startsWith('https://') && url.includes('railway.app');
}
