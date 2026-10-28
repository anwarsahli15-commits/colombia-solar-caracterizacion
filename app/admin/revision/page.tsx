import Link from 'next/link';
import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol } from '@/lib/sesion';
import { fechaHora } from '@/lib/estados';
import { ETIQUETA_RUTA } from '@/shared/validacion.mjs';
import { ResolverGps } from '@/components/admin/Acciones';

export const dynamic = 'force-dynamic';

export default async function Revision({ searchParams }: { searchParams: { estado?: string } }) {
  const perfil = await exigirRol(['supervisor', 'coordinador']);
  const sb = supabaseServidor();
  const estado = searchParams.estado === 'validada' ? 'validada' : 'enviada';
  const [{ data: encuestas }, { data: gps }, { data: perfiles }, { data: solicitudes }] = await Promise.all([
    sb.from('encuesta').select('id, codigo_registro, ruta, enviada_en, encuestador_id, vivienda:vivienda_id(id, direccion, niu, barrio:barrio_id(nombre))')
      .eq('vigente', true).eq('estado', estado).order('enviada_en').limit(200),
    sb.from('intento_visita').select('id, numero, precision_m, inicio, encuestador_id, vivienda:vivienda_id(id, direccion, niu)').eq('gps_excepcion', 'solicitada'),
    sb.from('perfil').select('id, nombre'),
    sb.from('solicitud_vivienda').select('id, direccion_reportada, observacion, creado, barrio:barrio_id(nombre)').eq('estado', 'abierta').order('creado'),
  ]);
  const nombres = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p.nombre]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Revisión de calidad</h1>
        <div className="flex gap-2">
          <Link href="/admin/revision" className={estado === 'enviada' ? 'btn-primario' : 'btn-secundario'}>Pendientes de validar</Link>
          <Link href="/admin/revision?estado=validada" className={estado === 'validada' ? 'btn-primario' : 'btn-secundario'}>Pendientes de aprobar</Link>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="tabla">
          <thead><tr><th>Vivienda</th><th>Barrio</th><th>Ruta</th><th>Encuestador</th><th>Enviada</th></tr></thead>
          <tbody>
            {(encuestas || []).map((e: any) => (
              <tr key={e.id}>
                <td><Link href={`/admin/viviendas/${e.vivienda.id}`} className="font-bold">{e.vivienda.direccion}</Link><div className="text-xs text-slate-500">NIU {e.vivienda.niu} · {e.codigo_registro}</div></td>
                <td>{e.vivienda.barrio?.nombre}</td>
                <td>{ETIQUETA_RUTA[e.ruta] || e.ruta}</td>
                <td>{nombres[e.encuestador_id]}</td>
                <td className="whitespace-nowrap">{fechaHora(e.enviada_en)}</td>
              </tr>
            ))}
            {(encuestas || []).length === 0 && <tr><td colSpan={5} className="text-slate-500">No hay encuestas en este estado.</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Excepciones de georreferenciación</h2>
        {(gps || []).length === 0 && <p className="text-sm text-slate-500">No hay solicitudes pendientes.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {(gps || []).map((g: any) => (
            <div key={g.id} className="tarjeta space-y-2 text-sm">
              <Link href={`/admin/viviendas/${g.vivienda.id}`} className="font-bold">{g.vivienda.direccion}</Link>
              <div>Visita {g.numero} · {fechaHora(g.inicio)} · {nombres[g.encuestador_id]} · mejor precisión {g.precision_m ?? '—'} m</div>
              {perfil.rol === 'coordinador' ? <ResolverGps intentoId={g.id} /> : <p className="text-slate-500">La resuelve el coordinador.</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Direcciones reportadas como no encontradas</h2>
        {(solicitudes || []).length === 0 && <p className="text-sm text-slate-500">Sin reportes abiertos.</p>}
        <ul className="space-y-1 text-sm">
          {(solicitudes || []).map((s: any) => (
            <li key={s.id} className="tarjeta"><b>{s.barrio?.nombre}</b> · {s.direccion_reportada} · {fechaHora(s.creado)}{s.observacion ? ` — ${s.observacion}` : ''}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
