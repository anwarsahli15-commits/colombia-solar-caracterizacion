import { redirect } from 'next/navigation';
import { obtenerPerfil } from '@/lib/sesion';

export default async function Inicio() {
  const p = await obtenerPerfil();
  if (!p) redirect('/login?motivo=perfil');
  redirect(p.rol === 'encuestador' ? '/campo' : '/admin');
}
