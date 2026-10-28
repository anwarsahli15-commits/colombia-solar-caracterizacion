'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import instrumento from '@/shared/instrumento-f5-v1.json';
import { evaluar, campoPorId, ETIQUETA_RUTA } from '@/shared/validacion.mjs';
import { supabaseNavegador } from '@/lib/supabase/client';
import { guardarBorradorLocal, leerBorradorLocal, borrarBorradorLocal, sincronizarArchivos, archivosPendientes } from '@/lib/offline';
import { hoyBogota } from '@/lib/estados';
import Campo from './Campo';

type Sync = 'guardado' | 'guardando' | 'local' | 'conflicto' | 'error';
const TEXTO_SYNC: Record<Sync, { t: string; c: string }> = {
  guardado: { t: 'Sincronizado', c: 'bg-verde-claro text-green-800' },
  guardando: { t: 'Guardando…', c: 'bg-slate-100 text-slate-700' },
  local: { t: 'Guardado en el teléfono · sin sincronizar', c: 'bg-sol-claro text-sol-oscuro' },
  conflicto: { t: 'Cambió en otro dispositivo', c: 'bg-red-50 text-red-800' },
  error: { t: 'Error al guardar', c: 'bg-red-50 text-red-800' },
};
const DEFS = campoPorId(instrumento);

export default function FormularioEncuesta({ encuesta, vivienda, config, revisiones, uid, gpsOk }: {
  encuesta: any; vivienda: any; config: any; revisiones: any[]; uid: string; gpsOk: boolean;
}) {
  const router = useRouter();
  const sb = supabaseNavegador();
  const editable = ['borrador', 'correccion'].includes(encuesta.estado) && encuesta.encuestador_id === uid;
  const [r, setR] = useState<Record<string, any>>(encuesta.respuestas || {});
  const version = useRef<number>(encuesta.version);
  const [sync, setSync] = useState<Sync>('guardado');
  const [paso, setPaso] = useState(0);
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [mostrarTodo, setMostrarTodo] = useState(false);
  const [pendLimpieza, setPendLimpieza] = useState<{ nuevo: Record<string, any>; afectados: string[] } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errServidor, setErrServidor] = useState<Record<string, string>>({});
  const temporizador = useRef<any>(null);
  const ctxEval = useMemo(() => ({ config, vivienda, hoy: hoyBogota() }), [config, vivienda]);
  const ev = useMemo(() => evaluar(instrumento, r, ctxEval), [r, ctxEval]);
  const secciones = instrumento.secciones.filter((s: any) => ev.seccionesVisibles.has(s.id));
  const pasos = [...secciones.map((s: any) => s.id), 'resumen'];
  const pasoActual = pasos[Math.min(paso, pasos.length - 1)];
  const ctxArchivo = { uid, viviendaId: vivienda.id, encuestaId: encuesta.id };

  // Recupera un borrador local más reciente que el del servidor.
  useEffect(() => {
    leerBorradorLocal(encuesta.id).then((b) => {
      if (!b || !editable) return;
      if (b.version === encuesta.version && b.guardado > new Date(encuesta.actualizado).getTime()) {
        setR(b.respuestas);
        setSync('local');
      } else if (b.version < encuesta.version) {
        borrarBorradorLocal(encuesta.id);
      }
    });
  }, []);

  const guardarServidor = useCallback(async (resp: Record<string, any>) => {
    if (!navigator.onLine) { setSync('local'); return; }
    setSync('guardando');
    const { data, error } = await sb.from('encuesta').update({ respuestas: resp })
      .eq('id', encuesta.id).eq('version', version.current).select('version').maybeSingle();
    if (error) { setSync('error'); return; }
    if (!data) { setSync('conflicto'); return; }
    version.current = data.version;
    await guardarBorradorLocal(encuesta.id, { respuestas: resp, version: data.version, guardado: Date.now() });
    setSync('guardado');
  }, [encuesta.id]);

  useEffect(() => {
    const alVolver = async () => {
      await sincronizarArchivos();
      if (sync === 'local') guardarServidor(r);
    };
    window.addEventListener('online', alVolver);
    return () => window.removeEventListener('online', alVolver);
  }, [r, sync, guardarServidor]);

  function aplicar(nuevo: Record<string, any>) {
    setR(nuevo);
    guardarBorradorLocal(encuesta.id, { respuestas: nuevo, version: version.current, guardado: Date.now() });
    setSync('local');
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => guardarServidor(nuevo), 1200);
  }

  function cambiar(id: string, valor: any) {
    setTocados((t) => new Set(t).add(id));
    const nuevo = { ...r, [id]: valor };
    if (valor === null) delete nuevo[id];
    const ev2 = evaluar(instrumento, nuevo, ctxEval);
    const nuevosOcultos = ev2.ocultosConValor.filter((k: string) => !ev.ocultosConValor.includes(k));
    if (nuevosOcultos.length) { setPendLimpieza({ nuevo, afectados: nuevosOcultos }); return; }
    aplicar(nuevo);
  }

  function confirmarLimpieza(ok: boolean) {
    if (ok && pendLimpieza) {
      const limpio = { ...pendLimpieza.nuevo };
      for (const k of pendLimpieza.afectados) delete limpio[k];
      aplicar(limpio);
    }
    setPendLimpieza(null);
  }

  function confirmarAlerta(id: string, ok: boolean) {
    const conf = { ...(r._conf || {}) };
    if (ok) conf[id] = r[id]; else delete conf[id];
    aplicar({ ...r, _conf: conf });
  }

  function irA(i: number) {
    setPaso(i);
    window.scrollTo({ top: 0 });
  }

  async function enviar() {
    setMostrarTodo(true);
    setMensaje('');
    if (!ev.completo) { setMensaje('Hay campos por corregir. Revise la lista.'); return; }
    if (!gpsOk) { setMensaje('La ubicación de la visita no cumple la precisión exigida y la excepción no ha sido aprobada.'); return; }
    if (!confirm('¿Enviar el formulario a revisión? Después no podrá editarlo, salvo que el supervisor lo devuelva.')) return;
    setEnviando(true);
    const s = await sincronizarArchivos();
    if (s.pendientes > 0 || (await archivosPendientes()).length > 0) {
      setEnviando(false);
      setMensaje('Hay fotos o firmas sin subir. Conéctese a internet y vuelva a intentarlo.');
      return;
    }
    clearTimeout(temporizador.current);
    const resp = await fetch(`/api/encuestas/${encuesta.id}/enviar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuestas: r, version: version.current }),
    }).catch(() => null);
    setEnviando(false);
    if (!resp) { setMensaje('Sin conexión. El formulario sigue guardado en el teléfono; envíelo cuando tenga señal.'); return; }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      setErrServidor(json.errores || {});
      setMensaje(json.mensaje || 'El servidor rechazó el envío.');
      return;
    }
    await borrarBorradorLocal(encuesta.id);
    router.push(`/campo/vivienda/${vivienda.id}`);
    router.refresh();
  }

  const errores = { ...ev.errores, ...errServidor };
  const ultimaDevolucion = revisiones.filter((x) => x.accion === 'devolver').at(-1);

  return (
    <div className="space-y-4">
      <div className="sticky top-[57px] z-20 -mx-4 space-y-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{vivienda.direccion}</div>
            <div className="text-xs text-slate-600">NIU {vivienda.niu} · {encuesta.codigo_registro}</div>
          </div>
          <span className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${TEXTO_SYNC[sync].c}`}>{TEXTO_SYNC[sync].t}</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-slate-200" aria-label={`Progreso ${ev.progreso.pct} %`}>
          <div className="h-full bg-verde transition-all" style={{ width: `${ev.progreso.pct}%` }} />
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {pasos.map((p, i) => {
            const s = ev.porSeccion[p];
            const titulo = p === 'resumen' ? 'Enviar' : instrumento.secciones.find((x: any) => x.id === p)!.titulo;
            const listo = s && s.total === s.ok && s.errores === 0;
            return (
              <button key={p} onClick={() => irA(i)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${i === paso ? 'bg-marca text-white' : listo ? 'bg-verde-claro text-green-800' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>
                {i + 1}. {titulo}
              </button>
            );
          })}
        </nav>
      </div>

      {sync === 'conflicto' && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Este formulario se modificó en otro dispositivo. Sus cambios están guardados en este teléfono. <button className="font-bold underline" onClick={() => location.reload()}>Recargar la versión del servidor</button>
        </p>
      )}
      {encuesta.estado === 'correccion' && ultimaDevolucion && (
        <div className="rounded-lg border border-sol bg-sol-claro p-3 text-sm">
          <div className="font-bold">Devuelto para corrección</div>
          <p>{ultimaDevolucion.observacion}</p>
        </div>
      )}
      {!editable && <p className="rounded-lg bg-marca-claro p-3 text-sm">Este formulario está en revisión y no puede editarse.</p>}

      {pasoActual !== 'resumen' && (() => {
        const s = instrumento.secciones.find((x: any) => x.id === pasoActual)!;
        return (
          <section className="space-y-6">
            <h1 className="text-xl font-bold">{s.titulo}</h1>
            {s.campos.filter((c: any) => ev.visibles.has(c.id)).map((c: any) => (
              <Campo key={c.id} def={c} valor={r[c.id] ?? null} onChange={(v) => cambiar(c.id, v)}
                requerido={ev.requeridos.has(c.id)}
                error={(mostrarTodo || tocados.has(c.id)) ? errores[c.id] : undefined}
                alerta={ev.alertas[c.id]} alertaConfirmada={r._conf?.[c.id] === r[c.id]}
                onConfirmarAlerta={(ok) => confirmarAlerta(c.id, ok)}
                ctx={ctxArchivo} textoDatos={config.texto_tratamiento_datos?.texto} deshabilitado={!editable} />
            ))}
          </section>
        );
      })()}

      {pasoActual === 'resumen' && (
        <section className="space-y-4">
          <h1 className="text-xl font-bold">Revisar y enviar</h1>
          <div className="tarjeta text-sm">
            <div><span className="font-bold">Ruta: </span>{ev.ruta ? ETIQUETA_RUTA[ev.ruta] : 'Aún no determinada'}</div>
            <div><span className="font-bold">Obligatorios completos: </span>{ev.progreso.ok} de {ev.progreso.total}</div>
            <div><span className="font-bold">Ubicación: </span>{gpsOk ? 'válida' : 'pendiente de excepción del coordinador'}</div>
          </div>
          {Object.keys(errores).length > 0 || ev.alertasPendientes.length > 0 ? (
            <div className="tarjeta space-y-2">
              <h2 className="font-bold">Pendientes antes de enviar</h2>
              <ul className="space-y-1 text-sm">
                {[...Object.keys(errores), ...ev.alertasPendientes.filter((k: string) => !errores[k])].map((k) => {
                  const d = DEFS[k];
                  const i = pasos.indexOf(d?.seccion);
                  return (
                    <li key={k}>
                      <button className="text-left text-marca underline" onClick={() => { setMostrarTodo(true); irA(Math.max(i, 0)); }}>
                        {d?.etiqueta || k}
                      </button>
                      <span className="text-slate-600"> — {errores[k] || 'Confirme el valor marcado como inusual.'}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg bg-verde-claro p-3 text-sm text-green-900">El formulario está completo.</p>
          )}
          {mensaje && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{mensaje}</p>}
          {editable && (
            <button className="btn-exito w-full" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar a revisión'}</button>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2">
          <button className="btn-secundario" onClick={() => irA(Math.max(0, paso - 1))} disabled={paso === 0}>Anterior</button>
          <button className="btn-primario" onClick={() => irA(Math.min(pasos.length - 1, paso + 1))} disabled={paso >= pasos.length - 1}>Siguiente</button>
        </div>
      </div>

      {pendLimpieza && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5">
            <h2 className="text-lg font-bold">Esta respuesta elimina datos ya diligenciados</h2>
            <p className="text-sm">Con el cambio, estas preguntas dejan de aplicar y se borrarán sus respuestas:</p>
            <ul className="list-disc pl-5 text-sm">{pendLimpieza.afectados.map((k) => <li key={k}>{DEFS[k]?.etiqueta || k}</li>)}</ul>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secundario" onClick={() => confirmarLimpieza(false)}>Cancelar</button>
              <button className="btn-peligro" onClick={() => confirmarLimpieza(true)}>Cambiar y borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
