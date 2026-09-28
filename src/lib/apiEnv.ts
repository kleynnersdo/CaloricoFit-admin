export type AppUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type AppSession = {
  access_token: string;
  token_type: string;
  user: AppUser;
};

/** Base URL de la API (sin slash final). */
export function getApiBase(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const raw = env.VITE_API_URL || env.VITE_LOCAL_API_URL || 'http://localhost:3032';
  return String(raw).replace(/\/$/, '');
}
