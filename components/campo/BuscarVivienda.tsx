'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseNavegador } from '@/lib/supabase/client';
import { normalizarDireccion } from '@/shared/normalizar.mjs';
import { ESTADOS_CAMPO } from '@/lib/estados';

type Barrio = { id: number; nombre: string };
type Resultado = { id: string; niu: string; direccion: string; estrato: string | null; estado_campo: string; intentos: number };

export default function BuscarVivienda({ barrios }: { barrios: Barrio[] }) {
  const [barrioId, setBarrioId] = useState<number | null>(null);
  const [filtroBarrio, setFiltroBarrio] = useState('');
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const turno = useRef(0);

  useEffect(() => {
    const guardado = Number(localStorage.getItem('cs_barrio'));
    if (guardado && barrios.some((b) => b.id === guardado)) setBarrioId(guardado);
  }, [barrios]);

  const barriosFiltrados = useMemo(() => {
    const f = normalizarDireccion(filtroBarrio);
    return barrios.filter((b) => !f || normalizarDireccion(b.nombre).includes(f));
  }, [barrios, filtroBarrio]);

  useEffect(() => {
    if (!barrioId) return;
    const t = setTimeout(async () => {
      const mio = ++turno.current;
      setCargando(true);
      setError('');
      const { data, error } = await supabaseNavegador().rpc('buscar_viviendas', { p_barrio: barrioId, p_q: normalizarDireccion(q) });
      if (mio !== turno.current) return;
      setCargando(false);
      if (error) setError('No se pudo buscar. Revise la conexión.');
      else setResultados(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [barrioId, q]);

  const barrio = barrios.find((b) => b.id === barrioId);

  if (!barrio) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-bold">1. Seleccione el barrio</h1>
        <input className="campo-input" placeholder="Buscar barrio" value={filtroBarrio} onChange={(e) => setFiltroBarrio(e.target.value)} />
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {barriosFiltrados.map((b) => (
            <li key={b.id}>
              <button className="flex min-h-[52px] w-full items-center px-4 text-left font-bold hover:bg-slate-50"
                onClick={() => { setBarrioId(b.id); localStorage.setItem('cs_barrio', String(b.id)); }}>
                {b.nombre}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase text-slate-500">Barrio</div>
          <div className="text-lg font-bold">{barrio.nombre}</div>
        </div>
        <button className="btn-secundario" onClick={() => { setBarrioId(null); setResultados([]); setQ(''); localStorage.removeItem('cs_barrio'); }}>
          Cambiar
        </button>
      </div>
      <label className="etiqueta" htmlFor="dir">2. Escriba la dirección o el NIU</label>
      <input id="dir" className="campo-input" autoComplete="off" inputMode="text" placeholder="Ej.: CR 15 SUR CL 46"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="text-xs text-slate-500">Toque la vivienda correcta. Compare el NIU y el estrato si hay direcciones parecidas.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {cargando && <p className="text-sm text-slate-500">Buscando…</p>}
      <ul className="space-y-2">
        {resultados.map((r) => {
          const est = ESTADOS_CAMPO[r.estado_campo] || ESTADOS_CAMPO.pendiente;
          return (
            <li key={r.id}>
              <Link href={`/campo/vivienda/${r.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-marca hover:no-underline">
                <div className="font-bold text-tinta">{r.direccion}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span>NIU {r.niu}</span>
                  {r.estrato && <span>Estrato {r.estrato}</span>}
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${est.tono}`}>{est.texto}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {!cargando && q && resultados.length === 0 && (
        <div className="tarjeta text-sm">
          <p className="font-bold">No hay coincidencias en este barrio.</p>
          <p className="mt-1 text-slate-600">Revise la escritura. Si la vivienda no está en la selección muestral, no puede caracterizarse; repórtela al coordinador.</p>
          <ReportarVivienda barrioId={barrio.id} direccion={q} />
        </div>
      )}
    </section>
  );
}

function ReportarVivienda({ barrioId, direccion }: { barrioId: number; direccion: string }) {
  const [estado, setEstado] = useState<'' | 'enviando' | 'ok' | 'error'>('');
  const [obs, setObs] = useState('');
  async function reportar() {
    setEstado('enviando');
    const { error } = await supabaseNavegador().from('solicitud_vivienda')
      .insert({ barrio_id: barrioId, direccion_reportada: direccion, observacion: obs || null });
    setEstado(error ? 'error' : 'ok');
  }
  if (estado === 'ok') return <p className="mt-3 text-green-800">Reporte enviado al coordinador.</p>;
  return (
    <div className="mt-3 space-y-2">
      <textarea className="campo-input min-h-[72px] py-2" placeholder="Observación (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
      <button className="btn-secundario w-full" onClick={reportar} disabled={estado === 'enviando'}>Reportar dirección no encontrada</button>
      {estado === 'error' && <p className="text-red-800">No se pudo enviar el reporte.</p>}
    </div>
  );
}
