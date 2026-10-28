import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol } from '@/lib/sesion';
import GestionUsuarios from '@/components/admin/GestionUsuarios';

export const dynamic = 'force-dynamic';

export default async function Usuarios() {
  await exigirRol(['coordinador']);
  const sb = supabaseServidor();
  const [{ data: perfiles }, { data: barrios }, { data: asignaciones }] = await Promise.all([
    sb.from('perfil').select('id, nombre, rol, activo').order('nombre'),
    sb.from('barrio').select('id, nombre').order('nombre'),
    sb.from('asignacion').select('encuestador_id, barrio_id'),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Usuarios y asignación de barrios</h1>
      <GestionUsuarios perfiles={perfiles || []} barrios={barrios || []} asignaciones={asignaciones || []} />
    </div>
  );
}
