import 'server-only';
import { redirect } from 'next/navigation';
import { supabaseServidor } from './supabase/server';

export type Rol = 'encuestador' | 'supervisor' | 'coordinador';
export type Perfil = { id: string; nombre: string; rol: Rol; activo: boolean };

export async function obtenerPerfil(): Promise<Perfil | null> {
  const sb = supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('perfil').select('id, nombre, rol, activo').eq('id', user.id).maybeSingle();
  if (!data || !data.activo) return null;
  return data as Perfil;
}

export async function exigirRol(roles: Rol[]): Promise<Perfil> {
  const p = await obtenerPerfil();
  if (!p) redirect('/login?motivo=sesion');
  if (!roles.includes(p.rol)) redirect('/');
  return p;
}

export async function leerConfig(sb = supabaseServidor()) {
  const { data } = await sb.from('config').select('clave, valor');
  return Object.fromEntries((data || []).map((c: any) => [c.clave, c.valor])) as Record<string, any>;
}
