import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const ROLES = ['encuestador', 'supervisor', 'coordinador'];

export async function POST(request: Request) {
  const sb = supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ mensaje: 'Sesión vencida.' }, { status: 401 });
  const { data: yo } = await sb.from('perfil').select('rol, activo').eq('id', user.id).maybeSingle();
  if (!yo || !yo.activo || yo.rol !== 'coordinador') return NextResponse.json({ mensaje: 'No autorizado.' }, { status: 403 });

  const b = await request.json().catch(() => null);
  const nombre = String(b?.nombre || '').trim();
  const correo = String(b?.correo || '').trim().toLowerCase();
  const rol = String(b?.rol || '');
  const clave = String(b?.clave || '');
  if (nombre.length < 3 || nombre.length > 120) return NextResponse.json({ mensaje: 'Nombre no válido.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(correo)) return NextResponse.json({ mensaje: 'Correo no válido.' }, { status: 400 });
  if (!ROLES.includes(rol)) return NextResponse.json({ mensaje: 'Rol no válido.' }, { status: 400 });
  if (clave.length < 10) return NextResponse.json({ mensaje: 'La contraseña temporal debe tener al menos 10 caracteres.' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
  if (error || !data.user) {
    return NextResponse.json({ mensaje: /registered|exists/i.test(error?.message || '') ? 'Ya existe un usuario con ese correo.' : 'No se pudo crear el usuario.' }, { status: 400 });
  }
  const { error: e2 } = await admin.from('perfil').insert({ id: data.user.id, nombre, rol });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ mensaje: 'No se pudo crear el perfil.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
