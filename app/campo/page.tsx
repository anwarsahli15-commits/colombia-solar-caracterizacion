import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol } from '@/lib/sesion';
import BuscarVivienda from '@/components/campo/BuscarVivienda';

export default async function Campo() {
  const perfil = await exigirRol(['encuestador', 'supervisor', 'coordinador']);
  const sb = supabaseServidor();
  let barrios: { id: number; nombre: string }[] = [];
  if (perfil.rol === 'encuestador') {
    const { data } = await sb.from('asignacion').select('barrio:barrio_id(id, nombre)').eq('encuestador_id', perfil.id);
    barrios = (data || []).map((a: any) => a.barrio).filter(Boolean).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
  } else {
    const { data } = await sb.from('barrio').select('id, nombre').order('nombre');
    barrios = data || [];
  }
  const { data: devueltas } = await sb
    .from('encuesta')
    .select('id, vivienda:vivienda_id(direccion, niu)')
    .eq('encuestador_id', perfil.id)
    .eq('vigente', true)
    .in('estado', ['borrador', 'correccion']);

  return (
    <div className="space-y-6">
      {(devueltas || []).length > 0 && (
        <section className="tarjeta border-sol bg-sol-claro">
          <h2 className="mb-2 font-bold">Formularios por terminar o corregir</h2>
          <ul className="space-y-2">
            {(devueltas || []).map((e: any) => (
              <li key={e.id}>
                <a className="font-bold" href={`/campo/encuesta/${e.id}`}>{e.vivienda?.direccion}</a>
                <span className="ml-2 text-sm text-slate-600">NIU {e.vivienda?.niu}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {barrios.length === 0 ? (
        <p className="tarjeta">No tiene barrios asignados. Solicite la asignación al coordinador.</p>
      ) : (
        <BuscarVivienda barrios={barrios} />
      )}
    </div>
  );
}
