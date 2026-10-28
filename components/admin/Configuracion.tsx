'use client';
import { useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';

export default function Configuracion({ inicial }: { inicial: Record<string, any> }) {
  const [c, setC] = useState({
    contrato: { objeto: '', contratante: '', contratista: '', plazo: '', ...(inicial.contrato || {}) },
    ubicacion: { departamento: '', municipio: '', ...(inicial.ubicacion || {}) },
    umbrales: { gps_precision_m: 4, consumo_max_kwh: 400, consumo_desviacion: 0.5, distancia_muestra_m: 100, personas_max: 20, ...(inicial.umbrales || {}) },
    texto_tratamiento_datos: { texto: '', ...(inicial.texto_tratamiento_datos || {}) },
  });
  const [msg, setMsg] = useState('');

  async function guardar() {
    setMsg('');
    const u = c.umbrales;
    if (!(u.gps_precision_m > 0 && u.gps_precision_m <= 4)) { setMsg('La precisión GPS debe estar entre 0 y 4 m.'); return; }
    if (!(u.consumo_max_kwh > 0) || !(u.consumo_desviacion > 0) || !(u.personas_max > 0)) { setMsg('Revise los umbrales.'); return; }
    const sb = supabaseNavegador();
    for (const [clave, valor] of Object.entries(c)) {
      const { error } = await sb.from('config').update({ valor, actualizado: new Date().toISOString() }).eq('clave', clave);
      if (error) { setMsg('No se pudo guardar: ' + error.message); return; }
    }
    setMsg('Configuración guardada. Los cambios quedan en la bitácora de auditoría.');
  }

  const campoTexto = (grupo: 'contrato' | 'ubicacion', k: string, t: string, largo = false) => (
    <div key={k}>
      <label className="etiqueta">{t}</label>
      {largo ? (
        <textarea className="campo-input min-h-[80px] py-2" value={(c as any)[grupo][k]} onChange={(e) => setC({ ...c, [grupo]: { ...(c as any)[grupo], [k]: e.target.value } })} />
      ) : (
        <input className="campo-input" value={(c as any)[grupo][k]} onChange={(e) => setC({ ...c, [grupo]: { ...(c as any)[grupo], [k]: e.target.value } })} />
      )}
    </div>
  );
  const campoNum = (k: string, t: string, paso = 1) => (
    <div key={k}>
      <label className="etiqueta">{t}</label>
      <input className="campo-input" type="number" step={paso} value={(c.umbrales as any)[k]}
        onChange={(e) => setC({ ...c, umbrales: { ...c.umbrales, [k]: Number(e.target.value) } })} />
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="tarjeta space-y-3">
        <h2 className="font-bold">Contrato (sección 1 del instrumento, solo lectura para encuestadores)</h2>
        {campoTexto('contrato', 'objeto', 'Número y objeto del contrato', true)}
        <div className="grid gap-3 md:grid-cols-3">
          {campoTexto('contrato', 'contratante', 'Contratante')}
          {campoTexto('contrato', 'contratista', 'Contratista')}
          {campoTexto('contrato', 'plazo', 'Plazo de ejecución')}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {campoTexto('ubicacion', 'departamento', 'Departamento')}
          {campoTexto('ubicacion', 'municipio', 'Municipio')}
        </div>
      </section>
      <section className="tarjeta space-y-3">
        <h2 className="font-bold">Umbrales de validación</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {campoNum('gps_precision_m', 'Precisión GPS máxima (m, ≤ 4 según términos)', 0.1)}
          {campoNum('consumo_max_kwh', 'Consumo promedio inusual a partir de (kWh)')}
          {campoNum('consumo_desviacion', 'Desviación frente a la muestra (0,5 = 50 %)', 0.05)}
          {campoNum('distancia_muestra_m', 'Alerta de distancia a coordenadas de la muestra (m)')}
          {campoNum('personas_max', 'Personas por medidor inusual a partir de')}
        </div>
      </section>
      <section className="tarjeta space-y-3">
        <h2 className="font-bold">Texto de tratamiento de datos personales</h2>
        <p className="text-sm text-slate-600">El encuestador lo lee en voz alta antes de pedir la aceptación. Use el texto oficial aprobado por GECELCA.</p>
        <textarea className="campo-input min-h-[220px] py-2" value={c.texto_tratamiento_datos.texto}
          onChange={(e) => setC({ ...c, texto_tratamiento_datos: { texto: e.target.value } })} />
      </section>
      {msg && <p className="rounded-lg bg-marca-claro p-3 text-sm">{msg}</p>}
      <button className="btn-primario" onClick={guardar}>Guardar configuración</button>
    </div>
  );
}
