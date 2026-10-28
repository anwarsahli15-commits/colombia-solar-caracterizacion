'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';
import { urlFirmada } from '@/lib/subir';

export function VistaArchivo({ ruta, bucket = 'evidencias', etiqueta }: { ruta: string; bucket?: string; etiqueta?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { urlFirmada(bucket, ruta).then(setUrl); }, [ruta, bucket]);
  const pdf = ruta.endsWith('.pdf');
  if (!url) return <div className="h-28 w-full animate-pulse rounded bg-slate-100" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {pdf ? <div className="flex h-28 items-center justify-center rounded border bg-slate-50 font-bold">PDF</div>
        : <img src={url} alt={etiqueta || ''} className="h-28 w-full rounded border object-cover" />}
      {etiqueta && <div className="mt-1 text-xs text-slate-600">{etiqueta}</div>}
    </a>
  );
}

export function BotonDescarga({ ruta, texto }: { ruta: string; texto: string }) {
  const [ocupado, setOcupado] = useState(false);
  async function bajar() {
    setOcupado(true);
    const { data, error } = await supabaseNavegador().storage.from('exportaciones').createSignedUrl(ruta, 600, { download: true });
    setOcupado(false);
    if (error) { alert('No se pudo generar el enlace de descarga.'); return; }
    window.location.href = data.signedUrl;
  }
  return <button className="btn-secundario min-h-[40px] text-sm" onClick={bajar} disabled={ocupado}>{texto}</button>;
}

function useRpc() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  async function llamar(fn: string, args: Record<string, any>, confirmar?: string) {
    if (confirmar && !confirm(confirmar)) return false;
    setOcupado(true); setError('');
    const { error } = await supabaseNavegador().rpc(fn, args);
    setOcupado(false);
    if (error) { setError(error.message); return false; }
    router.refresh();
    return true;
  }
  return { llamar, ocupado, error };
}

export function AccionesRevision({ encuestaId, estado, esCoordinador, certPendiente }: {
  encuestaId: string; estado: string; esCoordinador: boolean; certPendiente: boolean;
}) {
  const [obs, setObs] = useState('');
  const { llamar, ocupado, error } = useRpc();
  const run = async (accion: string, confirmar?: string) => {
    if (await llamar('revisar_encuesta', { p_encuesta: encuestaId, p_accion: accion, p_observacion: obs || null }, confirmar)) setObs('');
  };
  return (
    <div className="space-y-3">
      <textarea className="campo-input min-h-[80px] py-2" placeholder="Observación o motivo de devolución" value={obs} onChange={(e) => setObs(e.target.value)} />
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secundario" disabled={ocupado || !obs.trim()} onClick={() => run('observacion')}>Registrar observación</button>
        {['enviada', 'validada'].includes(estado) && (
          <button className="btn-peligro" disabled={ocupado || !obs.trim()} onClick={() => run('devolver', '¿Devolver la encuesta al encuestador para corrección?')}>Devolver para corrección</button>
        )}
        {estado === 'enviada' && (
          <button className="btn-primario" disabled={ocupado} onClick={() => run('validar', '¿Validar la encuesta? (ítem 5 del control de calidad)')}>Validar</button>
        )}
        {estado === 'validada' && esCoordinador && (
          <button className="btn-exito" disabled={ocupado} onClick={() => run('aprobar', '¿Aprobar la encuesta para exportación? (ítem 6 del control de calidad)')}>Aprobar para exportar</button>
        )}
        {certPendiente && esCoordinador && (
          <button className="btn-secundario" disabled={ocupado || !obs.trim()} onClick={() => run('excepcion_certificado', '¿Autorizar la aprobación sin certificado de tradición?')}>Excepción de certificado</button>
        )}
      </div>
    </div>
  );
}

export function ResolverGps({ intentoId }: { intentoId: string }) {
  const [obs, setObs] = useState('');
  const { llamar, ocupado, error } = useRpc();
  return (
    <div className="space-y-2">
      <input className="campo-input" placeholder="Justificación" value={obs} onChange={(e) => setObs(e.target.value)} />
      {error && <p className="text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-exito min-h-[40px]" disabled={ocupado || !obs.trim()} onClick={() => llamar('resolver_excepcion_gps', { p_intento: intentoId, p_aprobar: true, p_observacion: obs })}>Aprobar</button>
        <button className="btn-peligro min-h-[40px]" disabled={ocupado || !obs.trim()} onClick={() => llamar('resolver_excepcion_gps', { p_intento: intentoId, p_aprobar: false, p_observacion: obs })}>Rechazar</button>
      </div>
    </div>
  );
}

export function VisitaExtra({ viviendaId }: { viviendaId: string }) {
  const [motivo, setMotivo] = useState('');
  const { llamar, ocupado, error } = useRpc();
  return (
    <div className="space-y-2">
      <input className="campo-input" placeholder="Motivo de la visita adicional" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {error && <p className="text-sm text-red-800">{error}</p>}
      <button className="btn-secundario" disabled={ocupado || !motivo.trim()}
        onClick={() => llamar('autorizar_visita_extra', { p_vivienda: viviendaId, p_motivo: motivo }, '¿Autorizar una visita adicional? Queda registrado en la auditoría.')}>
        Autorizar visita adicional
      </button>
    </div>
  );
}

export function AccionPaquete({ paqueteId }: { paqueteId: string }) {
  const { llamar, ocupado, error } = useRpc();
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-primario min-h-[40px] text-sm" disabled={ocupado} onClick={() => llamar('gestionar_paquete_fallido', { p_paquete: paqueteId, p_accion: 'reintentar' })}>Reintentar generación</button>
      <button className="btn-secundario min-h-[40px] text-sm" disabled={ocupado}
        onClick={() => llamar('gestionar_paquete_fallido', { p_paquete: paqueteId, p_accion: 'liberar' }, '¿Liberar las 500 viviendas para que puedan incluirse en otro paquete?')}>Liberar viviendas</button>
      {error && <p className="w-full text-sm text-red-800">{error}</p>}
    </div>
  );
}
