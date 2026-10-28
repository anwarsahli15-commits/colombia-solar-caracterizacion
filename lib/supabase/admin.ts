import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { entornoPublico } from '../env';

// Cliente con privilegios. Solo para rutas de servidor que ya verificaron sesión y rol.
export function supabaseAdmin(): SupabaseClient {
  const { url } = entornoPublico();
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!secreta) throw new Error('Falta SUPABASE_SECRET_KEY en el servidor.');
  return createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
}
