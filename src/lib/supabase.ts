import { createClient } from '@supabase/supabase-js';

// Obtener y limpiar las credenciales de Supabase
// @ts-ignore
let rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
// @ts-ignore
let rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Evitar strings que digan literal 'undefined' o 'null' de variables ausentes en bundlers
if (!rawUrl || rawUrl === 'undefined' || rawUrl === 'null') {
  rawUrl = 'https://mock.supabase.co';
}
if (!rawKey || rawKey === 'undefined' || rawKey === 'null') {
  rawKey = 'mock-key';
}

// Limpiar barra diagonal final (trailing slash) y subrutas como /rest/v1 para evitar errores de ruta en Kong / PostgREST (ej. //auth/v1)
let cleanUrl = rawUrl;
try {
  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    const urlObj = new URL(cleanUrl);
    cleanUrl = urlObj.origin;
  }
} catch (e) {
  cleanUrl = cleanUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

export const supabaseUrl = cleanUrl;
export const supabaseAnonKey = rawKey;
export const isMockSupabase = supabaseUrl === 'https://mock.supabase.co' || supabaseAnonKey === 'mock-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
