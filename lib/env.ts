// Variables públicas. Se referencian de forma literal para que Next.js las incluya en el navegador.
export function entornoPublico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const ref = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
  if (!url || !key || !ref) {
    throw new Error('Faltan variables de entorno de Supabase. Revise .env.example.');
  }
  // Protección: la app solo se conecta al proyecto declarado para Colombia Solar.
  if (new URL(url).hostname !== `${ref}.supabase.co`) {
    throw new Error('La URL de Supabase no corresponde al proyecto declarado en NEXT_PUBLIC_SUPABASE_PROJECT_REF.');
  }
  return { url, key, ref };
}
