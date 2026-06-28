import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ipcStorage } from './supabase-storage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  const msg =
    '[supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el entorno. ' +
    'En local: copia frontend/.env.example a frontend/.env.local y rellena los valores. ' +
    'En CI: configura los secrets VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en GitHub.';
  if (import.meta.env.PROD) {
    throw new Error(msg);
  }
  console.warn(msg);
}

export const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        // SEC-009: persistir el token fuera del renderer (main process,
        // cifrado en reposo) en vez de localStorage.
        storage: ipcStorage,
      },
    })
  : null;

export type AppUser = {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  isDisabled: boolean;
  createdAt: string;
};

export type AuthSession = {
  user: AppUser;
  accessToken: string;
};
