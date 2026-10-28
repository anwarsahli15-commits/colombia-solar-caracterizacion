import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { entornoPublico } from '../env';

export function supabaseServidor(): SupabaseClient {
  const store = cookies();
  const { url, key } = entornoPublico();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(lista: { name: string; value: string; options?: any }[]) {
        try {
          lista.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesión.
        }
      },
    },
  }) as unknown as SupabaseClient;
}
