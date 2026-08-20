import { createClient } from '@supabase/supabase-js';
import { createLocalClient } from './localClient';

const useLocal =
  String((import.meta as any).env.VITE_LOCAL_MODE || '').toLowerCase() === 'true' ||
  String((import.meta as any).env.VITE_LOCAL_MODE || '') === '1';

// Obtener y limpiar las credenciales de Supabase
// @ts-ignore
let rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
// @ts-ignore
let rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!rawUrl || rawUrl === 'undefined' || rawUrl === 'null') {
  rawUrl = 'https://mock.supabase.co';
}
if (!rawKey || rawKey === 'undefined' || rawKey === 'null') {
  rawKey = 'mock-key';
}

let cleanUrl = rawUrl;
try {
  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    const urlObj = new URL(cleanUrl);
    cleanUrl = urlObj.origin;
  }
} catch {
  cleanUrl = cleanUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

export const isLocalMode = useLocal;
export const supabaseUrl = useLocal
  ? ((import.meta as any).env.VITE_LOCAL_API_URL || 'http://localhost:3032')
  : cleanUrl;
export const supabaseAnonKey = rawKey;
export const isMockSupabase =
  !useLocal && (supabaseUrl === 'https://mock.supabase.co' || supabaseAnonKey === 'mock-key');

export const supabase: any = useLocal
  ? createLocalClient()
  : createClient(cleanUrl, rawKey);
