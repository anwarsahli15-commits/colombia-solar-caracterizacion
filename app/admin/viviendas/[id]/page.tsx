import { notFound } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol, leerConfig } from '@/lib/sesion';
import { ESTADOS_CAMPO, ESTADOS_CALIDAD, fechaHora } from '@/lib/estados';
import instrumento from '@/shared/instrumento-f5-v1.json';
import { evaluar, esArchivo, ETIQUETA_RUTA } from '@/shared/validacion.mjs';
import { AccionesRevision, ResolverGps, VisitaExtra, VistaArchivo } from '@/components/admin/Acciones';

export const dynamic = 'force-dynamic';

function mostrar(c: any, v: any) {
  if (v === undefined || v === null || v === '') return '—';
  if (c.tipo === 'sino') return v === 'SI' ? 'Sí' : 'No';
  if (c.tipo === 'check') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.join('; ');
  return String(v);
}

export default async function DetalleVivienda({ params }: { params: { id: string } }) {
  const perfil = await exigirRol(['supervisor', 'coordinador']);
  const sb = supabaseServidor();
  const { data: v } = await sb.from('vivienda').select('*, barrio:barrio_id(nombre)').eq('id', params.id).maybeSingle();
  if (!v) notFound();
  const [{ data: est }, { data: intentos }, { data: encuestas }, { data: perfiles }, config] = await Promise.all([
    sb.from('v_vivienda_estado').select('*').eq('id', params.id).single(),
    sb.from('intento_visita').select('*').eq('vivienda_id', params.id).order('numero'),
    sb.from('encuesta').select('*').eq('vivienda_id', params.id).order('creado'),
    sb.from('perfil').select('id, nombre'),
    leerConfig(sb),
  ]);
  const nombres = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p.nombre]));
  const vigente = (encuestas || []).find((e: any) => e.vigente);
  const [{ data: revisiones }, { data: auditoria }] = await Promise.all([
    vigente ? sb.from('revision').select('*').eq('encuesta_id', vigente.id).order('creado') : Promise.resolve({ data: [] as any[] }),
    perfil.rol === 'coordinador'
      ? sb.from('auditoria').select('*').in('registro_id', [params.id, ...(intentos || []).map((i: any) => i.id), ...(encuestas || []).map((e: any) => e.id)]).order('creado', { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const ev = vigente ? evaluar(instrumento, vigente.respuestas || {}, { config, vivienda: v }) : null;

  return (
    <div className="space-y-6">
      <section className="tarjeta space-y-2">
        <div className="text-sm font-bold text-slate-500">{v.barrio?.nombre}</div>
        <h1 className="text-2xl font-bold">{v.direccion}</h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span><b>NIU</b> {v.niu}</span>
          <span><b>Estrato (muestra)</b> {v.estrato_muestra || '—'}</span>
          <span><b>Consumo (muestra)</b> {v.consumo_muestra ?? '—'} kWh</span>
          <span><b>Estado</b> {ESTADOS_CAMPO[est?.estado_campo]?.texto}</span>
          {vigente && <span><b>Calidad</b> {ESTADOS_CALIDAD[vigente.estado]}</span>}
          {est?.paquete_numero && <span><b>Paquete</b> N.º {est.paquete_numero}</span>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Intentos de visita</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {(intentos || []).map((i: any) => (
            <div key={i.id} className="tarjeta space-y-2 text-sm">
              <div className="font-bold">Visita {i.numero} · {i.resultado === 'atendida' ? 'Atendida' : i.resultado === 'cerrada' ? 'Sin atención' : 'Abierta'}</div>
              <div>{fechaHora(i.inicio)} · {nombres[i.encuestador_id]}</div>
              <div>{i.lat != null ? `${i.lat.toFixed(7)}, ${i.lon.toFixed(7)} · ±${i.precision_m} m` : 'Sin coordenadas'}</div>
              {i.foto_fachada && <VistaArchivo ruta={i.foto_fachada} etiqueta="Fotografía del inmueble" />}
              {i.gps_excepcion && <div className="font-bold text-sol-oscuro">Excepción GPS: {i.gps_excepcion}</div>}
              {i.gps_excepcion === 'solicitada' && perfil.rol === 'coordinador' && <ResolverGps intentoId={i.id} />}
              {i.observacion && <div className="text-slate-600">{i.observacion}</div>}
            </div>
          ))}
        </div>
        {perfil.rol === 'coordinador' && est?.estado_campo === 'no_atendida_3' && (
          <div className="tarjeta"><VisitaExtra viviendaId={v.id} /></div>
        )}
      </section>

      {vigente && ev && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">Formulario {vigente.codigo_registro}</h2>
            <span className="text-sm">{vigente.ruta ? ETIQUETA_RUTA[vigente.ruta] : 'Sin enviar'} · {nombres[vigente.encuestador_id]} · enviado {fechaHora(vigente.enviada_en)}</span>
          </div>
          {instrumento.secciones.filter((s: any) => ev.seccionesVisibles.has(s.id)).map((s: any) => (
            <div key={s.id} className="tarjeta">
              <h3 className="mb-3 font-bold">{s.titulo}</h3>
              <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                {s.campos.filter((c: any) => ev.visibles.has(c.id) && !c.tipo.startsWith('aviso')).map((c: any) => {
                  const val = vigente.respuestas?.[c.id];
                  return (
                    <div key={c.id}>
                      <dt className="text-xs font-bold text-slate-500">{c.etiqueta}</dt>
                      <dd className="text-sm">
                        {esArchivo(c) ? (val?.ruta ? <div className="w-40"><VistaArchivo ruta={val.ruta} /></div> : <span className="text-red-700">Sin evidencia</span>) : mostrar(c, val)}
                        {ev.errores[c.id] && <div className="text-xs font-bold text-red-700">{ev.errores[c.id]}</div>}
                        {ev.alertas[c.id] && <div className="text-xs text-sol-oscuro">{ev.alertas[c.id]}</div>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
          <div className="tarjeta space-y-3">
            <h3 className="font-bold">Revisión de calidad</h3>
            <ul className="space-y-1 text-sm">
              {(revisiones || []).map((r: any) => (
                <li key={r.id}><b>{r.accion}</b> · {nombres[r.revisor_id]} · {fechaHora(r.creado)}{r.observacion ? ` — ${r.observacion}` : ''}</li>
              ))}
              {(revisiones || []).length === 0 && <li className="text-slate-500">Sin revisiones.</li>}
            </ul>
            {vigente.estado !== 'borrador' && vigente.estado !== 'aprobada' && (
              <AccionesRevision encuestaId={vigente.id} estado={vigente.estado} esCoordinador={perfil.rol === 'coordinador'}
                certPendiente={vigente.respuestas?.cert_pendiente === true} />
            )}
          </div>
        </section>
      )}

      {(auditoria || []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Bitácora de cambios</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Tabla</th><th>Acción</th><th>Antes</th><th>Después</th></tr></thead>
              <tbody>{(auditoria || []).map((a: any) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{fechaHora(a.creado)}</td><td>{nombres[a.usuario] || 'Sistema'}</td><td>{a.tabla}</td><td>{a.accion}</td>
                  <td className="max-w-xs break-words font-mono text-xs">{a.antes ? JSON.stringify(a.antes).slice(0, 400) : ''}</td>
                  <td className="max-w-xs break-words font-mono text-xs">{a.despues ? JSON.stringify(a.despues).slice(0, 400) : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
