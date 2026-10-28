import Link from 'next/link';
import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol } from '@/lib/sesion';
import { ESTADOS_CAMPO, ESTADOS_CALIDAD, fechaHora } from '@/lib/estados';
import { normalizarDireccion } from '@/shared/normalizar.mjs';

export const dynamic = 'force-dynamic';
const POR_PAGINA = 50;

export default async function Viviendas({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  await exigirRol(['supervisor', 'coordinador']);
  const sb = supabaseServidor();
  const pagina = Math.max(1, Number(searchParams.p) || 1);
  const { data: barrios } = await sb.from('barrio').select('id, nombre').order('nombre');

  let q = sb.from('v_vivienda_estado')
    .select('id, niu, direccion, barrio, estado_campo, estado_calidad, intentos, ultima_visita, paquete_numero, encuestador_id', { count: 'exact' });
  if (searchParams.barrio) q = q.eq('barrio_id', Number(searchParams.barrio));
  if (searchParams.estado) q = q.eq('estado_campo', searchParams.estado);
  if (searchParams.calidad) q = q.eq('estado_calidad', searchParams.calidad);
  if (searchParams.encuestador) q = q.eq('encuestador_id', searchParams.encuestador);
  if (searchParams.q) {
    const t = searchParams.q.trim();
    if (/^[\d-]+$/.test(t)) q = q.ilike('niu', `%${t}%`);
    else {
      const { data: ids } = await sb.from('vivienda').select('id').ilike('direccion_norm', `%${normalizarDireccion(t)}%`).limit(500);
      q = q.in('id', (ids || []).map((x: any) => x.id));
    }
  }
  const { data, count } = await q.order('barrio').order('direccion').range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  const { data: encuestadores } = await sb.from('perfil').select('id, nombre').eq('rol', 'encuestador').order('nombre');
  const nombreEnc = Object.fromEntries((encuestadores || []).map((e: any) => [e.id, e.nombre]));
  const total = count || 0;
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(searchParams).filter(([, v]) => v)) as any, p: String(p) }).toString();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Viviendas</h1>
      <form className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-6">
        <input name="q" defaultValue={searchParams.q || ''} placeholder="Dirección o NIU" className="campo-input md:col-span-2" />
        <select name="barrio" defaultValue={searchParams.barrio || ''} className="campo-input">
          <option value="">Todos los barrios</option>
          {(barrios || []).map((b: any) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
        <select name="estado" defaultValue={searchParams.estado || ''} className="campo-input">
          <option value="">Todos los estados de campo</option>
          {Object.entries(ESTADOS_CAMPO).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
        <select name="calidad" defaultValue={searchParams.calidad || ''} className="campo-input">
          <option value="">Toda calidad</option>
          {Object.entries(ESTADOS_CALIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="encuestador" defaultValue={searchParams.encuestador || ''} className="campo-input">
          <option value="">Todos los encuestadores</option>
          {(encuestadores || []).map((e: any) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <button className="btn-primario md:col-span-6">Filtrar</button>
      </form>
      <p className="text-sm text-slate-600">{total.toLocaleString('es-CO')} viviendas</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="tabla">
          <thead><tr><th>Dirección oficial</th><th>NIU</th><th>Barrio</th><th>Estado de campo</th><th>Calidad</th><th>Intentos</th><th>Última visita</th><th>Encuestador</th><th>Paquete</th></tr></thead>
          <tbody>
            {(data || []).map((v: any) => (
              <tr key={v.id}>
                <td><Link href={`/admin/viviendas/${v.id}`} className="font-bold">{v.direccion}</Link></td>
                <td className="whitespace-nowrap">{v.niu}</td>
                <td>{v.barrio}</td>
                <td>{ESTADOS_CAMPO[v.estado_campo]?.texto}</td>
                <td>{v.estado_calidad ? ESTADOS_CALIDAD[v.estado_calidad] : '—'}</td>
                <td className="tabular-nums">{v.intentos}</td>
                <td className="whitespace-nowrap">{fechaHora(v.ultima_visita)}</td>
                <td>{nombreEnc[v.encuestador_id] || '—'}</td>
                <td>{v.paquete_numero ? `N.º ${v.paquete_numero}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between">
        {pagina > 1 ? <Link className="btn-secundario" href={`?${qs(pagina - 1)}`}>Anterior</Link> : <span />}
        {pagina * POR_PAGINA < total && <Link className="btn-secundario" href={`?${qs(pagina + 1)}`}>Siguiente</Link>}
      </div>
    </div>
  );
}
