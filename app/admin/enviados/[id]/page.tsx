import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol } from '@/lib/sesion';
import { ETIQUETA_RUTA } from '@/shared/validacion.mjs';

export const dynamic = 'force-dynamic';

export default async function DetallePaquete({ params }: { params: { id: string } }) {
  await exigirRol(['coordinador']);
  const sb = supabaseServidor();
  const { data: p } = await sb.from('paquete').select('id, numero, estado').eq('id', params.id).maybeSingle();
  if (!p) notFound();
  const { data: filas } = await sb.from('paquete_vivienda')
    .select('vivienda:vivienda_id(id, niu, direccion, barrio:barrio_id(nombre)), encuesta:encuesta_id(codigo_registro, ruta)')
    .eq('paquete_id', params.id).limit(1000);
  const orden = (filas || []).sort((a: any, b: any) => (a.vivienda.barrio?.nombre + a.vivienda.direccion).localeCompare(b.vivienda.barrio?.nombre + b.vivienda.direccion));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{p.numero ? `Paquete enviado N.º ${p.numero}` : 'Paquete'} · {orden.length} viviendas</h1>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="tabla">
          <thead><tr><th>#</th><th>Barrio</th><th>Dirección oficial</th><th>NIU</th><th>Código</th><th>Resultado</th></tr></thead>
          <tbody>{orden.map((f: any, i: number) => (
            <tr key={f.vivienda.id}>
              <td className="tabular-nums">{i + 1}</td><td>{f.vivienda.barrio?.nombre}</td>
              <td><Link href={`/admin/viviendas/${f.vivienda.id}`}>{f.vivienda.direccion}</Link></td>
              <td className="whitespace-nowrap">{f.vivienda.niu}</td><td>{f.encuesta.codigo_registro}</td><td>{ETIQUETA_RUTA[f.encuesta.ruta]}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
