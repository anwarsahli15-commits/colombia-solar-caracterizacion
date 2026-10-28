'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { entornoPublico } from '../env';

let cliente: SupabaseClient | null = null;

export function supabaseNavegador(): SupabaseClient {
  if (!cliente) {
    const { url, key } = entornoPublico();
    cliente = createBrowserClient(url, key) as unknown as SupabaseClient;
  }
  return cliente;
}
