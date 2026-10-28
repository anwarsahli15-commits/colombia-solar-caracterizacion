'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { supabaseNavegador } from '@/lib/supabase/client';
import { normalizarDireccion } from '@/shared/normalizar.mjs';

const clave = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Columnas de la selección muestral (Entregable 4). Las tres primeras son obligatorias.
const COLUMNAS: Record<string, { nombres: string[]; requerida?: boolean }> = {
  niu: { nombres: ['niu'], requerida: true },
  direccion: { nombres: ['direccion'], requerida: true },
  barrio: { nombres: ['barrio oficial pot', 'barrio pot', 'barrio'], requerida: true },
  localidad: { nombres: ['localidad pot'] },
  zona: { nombres: ['zona pot'] },
  ranking: { nombres: ['ranking en programa'] },
  codigo_dane: { nombres: ['codigo dane'] },
  ubicacion: { nombres: ['ubicacion (r/u/c)'] },
  estrato: { nombres: ['estrato socioeconomico'] },
  lat: { nombres: ['latitud (usuario)'] },
  lon: { nombres: ['longitud (usuario)'] },
  consumo: { nombres: ['consumo promedio semestral (kwh)'] },
};
const num = (v: any) => {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

type Fila = Record<string, any>;
type Error = { fila: number; niu: string; motivo: string };

export default function Importador() {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mapa, setMapa] = useState<Record<string, string | null>>({});
  const [validas, setValidas] = useState<Fila[]>([]);
  const [errores, setErrores] = useState<Error[]>([]);
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  const [leidas, setLeidas] = useState(0);
  const [progreso, setProgreso] = useState<null | { hechas: number; nuevas: number; existentes: number }>(null);
  const [fin, setFin] = useState('');
  const [fallo, setFallo] = useState('');

  async function leer(f: File) {
    setArchivo(f); setFin(''); setFallo(''); setProgreso(null);
    const buf = await f.arrayBuffer();
    let texto = new TextDecoder('utf-8').decode(buf);
    if (texto.includes('\uFFFD')) texto = new TextDecoder('windows-1252').decode(buf);
    const r = Papa.parse<Record<string, string>>(texto, { header: true, skipEmptyLines: true, delimiter: '' });
    const encabezados = (r.meta.fields || []).filter(Boolean);
    const m: Record<string, string | null> = {};
    for (const [k, def] of Object.entries(COLUMNAS)) m[k] = encabezados.find((h) => def.nombres.includes(clave(h))) || null;
    setMapa(m);
    const faltan = Object.entries(COLUMNAS).filter(([k, d]) => d.requerida && !m[k]).map(([k]) => k);
    if (faltan.length) { setFallo(`El archivo no tiene las columnas obligatorias: ${faltan.join(', ')}.`); setValidas([]); return; }

    const vistos = new Map<string, number>();
    const ok: Fila[] = []; const errs: Error[] = []; const adv: string[] = [];
    r.data.forEach((row, i) => {
      const n = i + 2;
      const niu = String(row[m.niu!] ?? '').trim();
      const direccion = String(row[m.direccion!] ?? '').trim();
      const barrio = String(row[m.barrio!] ?? '').trim();
      if (!niu) { errs.push({ fila: n, niu, motivo: 'NIU vacío' }); return; }
      if (!/^[0-9-]{3,30}$/.test(niu)) { errs.push({ fila: n, niu, motivo: 'NIU con formato no válido' }); return; }
      if (vistos.has(niu)) { errs.push({ fila: n, niu, motivo: `NIU duplicado (también en la fila ${vistos.get(niu)})` }); return; }
      if (!direccion) { errs.push({ fila: n, niu, motivo: 'Dirección vacía' }); return; }
      if (!barrio) { errs.push({ fila: n, niu, motivo: 'Barrio vacío' }); return; }
      vistos.set(niu, n);
      const lat = m.lat ? num(row[m.lat]) : null;
      const lon = m.lon ? num(row[m.lon]) : null;
      const consumo = m.consumo ? num(row[m.consumo]) : null;
      const ranking = m.ranking ? num(row[m.ranking]) : null;
      if (Number.isNaN(lat) || Number.isNaN(lon) || (lat !== null && (lat < -5 || lat > 14)) || (lon !== null && (lon < -82 || lon > -66)))
        adv.push(`Fila ${n} (NIU ${niu}): coordenadas no válidas; se cargan vacías.`);
      const datos: Record<string, string> = {};
      for (const h of encabezados) datos[h] = row[h];
      ok.push({
        niu, direccion, direccion_norm: normalizarDireccion(direccion), barrio,
        localidad: m.localidad ? row[m.localidad] || null : null,
        zona: m.zona ? row[m.zona] || null : null,
        ranking: ranking !== null && Number.isInteger(ranking) ? ranking : null,
        codigo_dane: m.codigo_dane ? String(row[m.codigo_dane] || '').trim() || null : null,
        ubicacion: m.ubicacion ? row[m.ubicacion] || null : null,
        estrato: m.estrato ? row[m.estrato] || null : null,
        lat: lat !== null && !Number.isNaN(lat) && lat >= -5 && lat <= 14 ? lat : null,
        lon: lon !== null && !Number.isNaN(lon) && lon >= -82 && lon <= -66 ? lon : null,
        consumo: consumo !== null && !Number.isNaN(consumo) && consumo >= 0 ? consumo : null,
        datos,
      });
    });
    // Direcciones idénticas en el mismo barrio con NIU distinto: se cargan, pero se avisan.
    const porDir = new Map<string, string[]>();
    for (const f of ok) { const k = f.barrio + '|' + f.direccion_norm; porDir.set(k, [...(porDir.get(k) || []), f.niu]); }
    for (const [k, nius] of porDir) if (nius.length > 1) adv.push(`Dirección repetida en ${k.split('|')[0]}: NIU ${nius.join(', ')}. El encuestador deberá distinguirlas por NIU.`);
    setLeidas(r.data.length); setValidas(ok); setErrores(errs); setAdvertencias(adv);
  }

  async function importar() {
    if (!archivo || !validas.length) return;
    if (!confirm(`¿Importar ${validas.length} viviendas? Las que ya existan (mismo NIU) no se modificarán.`)) return;
    const sb = supabaseNavegador();
    setFallo('');
    const { data: id, error } = await sb.rpc('importar_iniciar', { p_archivo: archivo.name, p_leidas: leidas });
    if (error) { setFallo(error.message); return; }
    let nuevas = 0, existentes = 0;
    setProgreso({ hechas: 0, nuevas, existentes });
    for (let i = 0; i < validas.length; i += 1000) {
      const lote = validas.slice(i, i + 1000);
      const { data, error } = await sb.rpc('importar_lote', { p_importacion: id, p_filas: lote });
      if (error) { setFallo(`Falló el lote que inicia en la vivienda ${i + 1}: ${error.message}. Las anteriores quedaron cargadas; puede reintentar con el mismo archivo.`); return; }
      nuevas += data.insertadas; existentes += data.existentes;
      setProgreso({ hechas: Math.min(i + 1000, validas.length), nuevas, existentes });
    }
    await sb.rpc('importar_finalizar', { p_importacion: id, p_rechazadas: errores.length, p_errores: errores.slice(0, 5000) });
    setFin(`Importación completa: ${nuevas} viviendas nuevas, ${existentes} ya existían, ${errores.length} rechazadas.`);
    router.refresh();
  }

  function descargarErrores() {
    const csv = Papa.unparse(errores.map((e) => ({ fila: e.fila, niu: e.niu, motivo: e.motivo })), { delimiter: ';' });
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'registros_rechazados.csv'; a.click();
  }

  return (
    <section className="tarjeta space-y-4">
      <div>
        <label className="etiqueta" htmlFor="archivo">Archivo CSV de la selección muestral</label>
        <input id="archivo" type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
        <p className="mt-1 text-xs text-slate-500">Se aceptan CSV separados por «;» o «,» en UTF-8 o Windows-1252 (como el Entregable 4).</p>
      </div>
      {fallo && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{fallo}</p>}
      {Object.keys(mapa).length > 0 && (
        <div className="text-sm">
          <div className="font-bold">Columnas identificadas</div>
          <ul className="grid gap-x-4 md:grid-cols-3">
            {Object.entries(mapa).map(([k, v]) => <li key={k}><span className="text-slate-500">{k}:</span> {v || <i className="text-slate-400">no encontrada</i>}</li>)}
          </ul>
        </div>
      )}
      {leidas > 0 && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-bold">{leidas}</div><div className="text-xs">Filas leídas</div></div>
          <div className="rounded-lg bg-verde-claro p-3"><div className="text-2xl font-bold">{validas.length}</div><div className="text-xs">Válidas</div></div>
          <div className="rounded-lg bg-red-50 p-3"><div className="text-2xl font-bold">{errores.length}</div><div className="text-xs">Rechazadas</div></div>
        </div>
      )}
      {validas.length > 0 && (
        <div className="overflow-x-auto">
          <div className="mb-1 text-sm font-bold">Vista previa</div>
          <table className="tabla">
            <thead><tr><th>NIU</th><th>Dirección</th><th>Barrio</th><th>Estrato</th><th>Lat</th><th>Lon</th><th>Consumo</th></tr></thead>
            <tbody>{validas.slice(0, 10).map((f) => (
              <tr key={f.niu}><td>{f.niu}</td><td>{f.direccion}</td><td>{f.barrio}</td><td>{f.estrato}</td><td>{f.lat}</td><td>{f.lon}</td><td>{f.consumo}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {errores.length > 0 && (
        <div className="space-y-1 text-sm">
          <div className="font-bold">Registros rechazados</div>
          <ul className="max-h-40 overflow-y-auto">{errores.slice(0, 100).map((e) => <li key={e.fila}>Fila {e.fila}: {e.motivo} {e.niu && `(NIU ${e.niu})`}</li>)}</ul>
          <button className="btn-secundario min-h-[40px]" onClick={descargarErrores}>Descargar reporte de rechazados</button>
        </div>
      )}
      {advertencias.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer font-bold">{advertencias.length} advertencias</summary>
          <ul className="max-h-40 overflow-y-auto">{advertencias.slice(0, 300).map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}
      {progreso && (
        <div>
          <div className="h-2 overflow-hidden rounded bg-slate-200"><div className="h-full bg-verde" style={{ width: `${(progreso.hechas / validas.length) * 100}%` }} /></div>
          <p className="text-sm">{progreso.hechas} de {validas.length} procesadas · {progreso.nuevas} nuevas · {progreso.existentes} ya existían</p>
        </div>
      )}
      {fin && <p className="rounded-lg bg-verde-claro p-3 text-sm text-green-900">{fin}</p>}
      <button className="btn-primario" disabled={!validas.length || (!!progreso && !fin && !fallo)} onClick={importar}>Confirmar importación</button>
    </section>
  );
}
