'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';
import instrumento from '@/shared/instrumento-f5-v1.json';
import { ETIQUETA_RUTA } from '@/shared/validacion.mjs';
import { fechaHora } from '@/lib/estados';

const TAMANO = 500;
export const PLANTILLA_VERSION = 'EXPORT-F5-V1';
type Apta = { vivienda_id: string; encuesta_id: string; niu: string; direccion: string; barrio: string; ruta: string; aprobada_en: string; observaciones: number };

export default function SelectorPaquete() {
  const router = useRouter();
  const [aptas, setAptas] = useState<Apta[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [barrio, setBarrio] = useState('');
  const [limite, setLimite] = useState(100);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [creando, setCreando] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabaseNavegador().rpc('viviendas_aptas');
    setCargando(false);
    if (error) { setError('No se pudieron cargar las viviendas aptas.'); return; }
    setAptas(data || []);
    setSel((s) => new Set([...s].filter((id) => (data || []).some((a: Apta) => a.vivienda_id === id))));
  }
  useEffect(() => { cargar(); }, []);

  const barrios = useMemo(() => [...new Set(aptas.map((a) => a.barrio))].sort(), [aptas]);
  const visibles = aptas.filter((a) => !barrio || a.barrio === barrio);
  const elegidas = aptas.filter((a) => sel.has(a.vivienda_id));
  const resumen = {
    total: sel.size,
    unicas: new Set(elegidas.map((a) => a.vivienda_id)).size,
    participantes: elegidas.filter((a) => a.ruta === 'completa').length,
    desistimientos: elegidas.filter((a) => a.ruta === 'desistimiento').length,
    sinDatos: elegidas.filter((a) => a.ruta === 'sin_datos').length,
    observaciones: elegidas.filter((a) => a.observaciones > 0).length,
  };
  const listo = resumen.total === TAMANO && resumen.unicas === TAMANO;

  function alternar(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else if (n.size < TAMANO) n.add(id);
      return n;
    });
  }
  function autoseleccionar() {
    const n = new Set(sel);
    for (const a of visibles) { if (n.size >= TAMANO) break; n.add(a.vivienda_id); }
    setSel(n);
  }

  async function crear() {
    setCreando(true); setError('');
    const { error } = await supabaseNavegador().rpc('crear_paquete', {
      p_viviendas: [...sel], p_instrumento: instrumento.version, p_plantilla: PLANTILLA_VERSION,
    });
    setCreando(false); setConfirmando(false);
    if (error) { setError(error.message); cargar(); return; }
    router.push('/admin/enviados?nuevo=1');
  }

  if (cargando) return <p className="tarjeta">Cargando viviendas aptas…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ['Aptas disponibles', aptas.length], ['Seleccionadas', resumen.total], ['Únicas', resumen.unicas],
          ['Participantes', resumen.participantes], ['Desistimientos', resumen.desistimientos + resumen.sinDatos], ['Con observaciones', resumen.observaciones],
        ].map(([t, v]) => (
          <div key={t as string} className="tarjeta"><div className="text-2xl font-bold tabular-nums">{v as number}</div><div className="text-xs text-slate-600">{t}</div></div>
        ))}
      </div>
      {aptas.length < TAMANO && (
        <p className="rounded-lg bg-sol-claro p-3 text-sm text-sol-oscuro">
          Hay {aptas.length} viviendas aptas. Faltan {TAMANO - aptas.length} para poder generar un paquete ordinario de {TAMANO}.
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select className="campo-input w-auto" value={barrio} onChange={(e) => setBarrio(e.target.value)}>
          <option value="">Todos los barrios</option>
          {barrios.map((b) => <option key={b}>{b}</option>)}
        </select>
        <button className="btn-secundario" onClick={autoseleccionar} disabled={sel.size >= TAMANO}>Completar hasta {TAMANO} (orden de aprobación)</button>
        <button className="btn-secundario" onClick={() => setSel(new Set())} disabled={!sel.size}>Quitar selección</button>
        <button className="btn-exito ml-auto" disabled={!listo} onClick={() => setConfirmando(true)}>Generar paquete</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="tabla">
          <thead><tr><th className="w-10"></th><th>Dirección oficial</th><th>NIU</th><th>Barrio</th><th>Resultado</th><th>Aprobada</th><th>Obs.</th></tr></thead>
          <tbody>
            {visibles.slice(0, limite).map((a) => (
              <tr key={a.vivienda_id} className={sel.has(a.vivienda_id) ? 'bg-verde-claro' : ''}>
                <td><input type="checkbox" className="h-5 w-5" checked={sel.has(a.vivienda_id)} onChange={() => alternar(a.vivienda_id)} aria-label={`Seleccionar ${a.direccion}`} /></td>
                <td><a href={`/admin/viviendas/${a.vivienda_id}`} target="_blank" rel="noreferrer">{a.direccion}</a></td>
                <td className="whitespace-nowrap">{a.niu}</td><td>{a.barrio}</td><td>{ETIQUETA_RUTA[a.ruta]}</td>
                <td className="whitespace-nowrap">{fechaHora(a.aprobada_en)}</td><td>{a.observaciones || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length > limite && <button className="btn-secundario w-full" onClick={() => setLimite((l) => l + 200)}>Mostrar más ({visibles.length - limite} restantes)</button>}

      {confirmando && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold">Confirmar generación del paquete</h2>
            <ul className="space-y-1 text-sm">
              <li>Viviendas únicas: <b>{resumen.unicas}</b></li>
              <li>Participantes: <b>{resumen.participantes}</b></li>
              <li>Desistimientos: <b>{resumen.desistimientos}</b></li>
              <li>No aceptan tratamiento de datos: <b>{resumen.sinDatos}</b></li>
              <li>Con observaciones registradas: <b>{resumen.observaciones}</b></li>
              <li>Instrumento: {instrumento.version} · Plantilla: {PLANTILLA_VERSION}</li>
            </ul>
            <p className="text-sm text-slate-600">Las viviendas quedan reservadas de inmediato. El Excel y el ZIP se generan en segundo plano (normalmente en menos de 15 minutos). Si la generación falla, las viviendas no se marcan como exportadas.</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secundario" onClick={() => setConfirmando(false)} disabled={creando}>Cancelar</button>
              <button className="btn-exito" onClick={crear} disabled={creando}>{creando ? 'Reservando…' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
