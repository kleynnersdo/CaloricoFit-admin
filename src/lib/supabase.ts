import { createClient } from '@supabase/supabase-js';

// Cliente de base de datos para la aplicación principal
// @ts-ignore
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock.supabase.co';
// @ts-ignore
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
