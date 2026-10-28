'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';
import { ESTADOS_CAMPO, fechaHora } from '@/lib/estados';
import { urlFirmada } from '@/lib/subir';
import instrumento from '@/shared/instrumento-f5-v1.json';
import GpsCaptura, { type LecturaGps } from './GpsCaptura';
import FotoEvidencia, { type ValorArchivo } from './FotoEvidencia';
import { sincronizarArchivos } from '@/lib/offline';

type Intento = {
  id: string; numero: number; inicio: string; resultado: string | null; precision_m: number | null; foto_fachada: string | null;
  cerrado: boolean; encuestador_id: string; gps_excepcion: string | null; lat: number | null; lon: number | null; gps_intentos: number;
};

function distanciaM(a: [number, number], b: [number, number]) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function PanelVivienda({ vivienda, estado, intentos, encuesta, uid, umbralGps }: {
  vivienda: any; estado: any; intentos: Intento[]; encuesta: any; uid: string; umbralGps: number;
}) {
  const router = useRouter();
  const sb = supabaseNavegador();
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const abierto = intentos.find((i) => !i.cerrado && i.encuestador_id === uid) || null;
  const [intento, setIntento] = useState<Intento | null>(abierto);
  const [paso, setPaso] = useState<'gps' | 'resultado' | 'cerrada'>(abierto?.resultado === 'cerrada' ? 'cerrada' : abierto?.lat != null ? 'resultado' : 'gps');
  const [fachada, setFachada] = useState<ValorArchivo>(abierto?.foto_fachada ? { ruta: abierto.foto_fachada, sha256: '', mime: 'image/jpeg' } : null);
  const [gpsFallos, setGpsFallos] = useState(abierto?.gps_intentos || 0);

  const est = ESTADOS_CAMPO[estado?.estado_campo] || ESTADOS_CAMPO.pendiente;
  const miEncuestaEditable = encuesta && encuesta.encuestador_id === uid && ['borrador', 'correccion'].includes(encuesta.estado);
  const atendida = !!encuesta && encuesta.ruta !== 'reprogramada' || estado?.estado_campo === 'atendida_otro';
  const puedeIniciar = !atendida && !intento && !miEncuestaEditable && !intentos.some((i) => !i.cerrado);

  async function iniciar() {
    setOcupado(true); setError('');
    const { data, error } = await sb.from('intento_visita').insert({ vivienda_id: vivienda.id }).select('*').single();
    setOcupado(false);
    if (error) { setError(error.message); return; }
    setIntento(data); setPaso('gps'); setGpsFallos(0);
  }

  async function guardarGps(l: LecturaGps) {
    if (!intento) return;
    const { data, error } = await sb.from('intento_visita').update({
      lat: l.lat, lon: l.lon, altitud: l.altitud, precision_m: l.precision, gps_hora: l.hora,
      gps_dispositivo: navigator.userAgent.slice(0, 300), gps_intentos: (intento.gps_intentos || 0) + 1,
    }).eq('id', intento.id).select('*').single();
    if (error) { setError('No se pudo guardar la ubicación: ' + error.message); return; }
    setIntento(data);
    if (l.precision <= umbralGps) setPaso('resultado');
  }

  async function solicitarExcepcion() {
    if (!intento) return;
    const { data, error } = await sb.from('intento_visita').update({ gps_excepcion: 'solicitada' }).eq('id', intento.id).select('*').single();
    if (error) { setError(error.message); return; }
    setIntento(data); setPaso('resultado');
  }

  async function atendieron() {
    if (!intento) return;
    setOcupado(true); setError('');
    const { data, error } = await sb.from('encuesta')
      .insert({ vivienda_id: vivienda.id, intento_id: intento.id, instrumento_version: instrumento.version })
      .select('id').single();
    setOcupado(false);
    if (error) { setError(error.message); return; }
    router.push(`/campo/encuesta/${data.id}`);
  }

  async function marcarCerrada() {
    if (!intento) return;
    const { error } = await sb.from('intento_visita').update({ resultado: 'cerrada' }).eq('id', intento.id);
    if (error) { setError(error.message); return; }
    setPaso('cerrada');
  }

  async function cerrarIntento() {
    if (!intento || !fachada?.ruta) return;
    if (!confirm('¿Cerrar el intento como «vivienda cerrada / sin atención»? No podrá modificarlo después.')) return;
    setOcupado(true); setError('');
    if (fachada.pendiente) {
      const r = await sincronizarArchivos();
      if (r.pendientes > 0) { setOcupado(false); setError('La fotografía aún no se ha subido. Conéctese a internet y reintente.'); return; }
    }
    const { error } = await sb.from('intento_visita').update({ foto_fachada: fachada.ruta, cerrado: true }).eq('id', intento.id);
    setOcupado(false);
    if (error) {
      if (/precisi/i.test(error.message)) {
        setError('El intento quedó registrado, pero no puede cerrarse hasta que el coordinador apruebe la excepción de ubicación.');
        await sb.from('intento_visita').update({ foto_fachada: fachada.ruta }).eq('id', intento.id);
      } else setError(error.message);
      return;
    }
    router.refresh();
    setIntento(null);
  }

  const dist = intento?.lat != null && vivienda.lat_muestra != null
    ? Math.round(distanciaM([intento.lat, intento.lon!], [vivienda.lat_muestra, vivienda.lon_muestra])) : null;

  return (
    <div className="space-y-4">
      <section className="tarjeta space-y-3">
        <div className="text-xs font-bold uppercase text-slate-500">{vivienda.barrio?.nombre}</div>
        <div>
          <div className="text-xs font-bold text-slate-500">Dirección oficial · solo lectura</div>
          <div className="text-lg font-bold">{vivienda.direccion}</div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div><span className="font-bold text-slate-500">NIU </span>{vivienda.niu}</div>
          {vivienda.estrato_muestra && <div><span className="font-bold text-slate-500">Estrato muestra </span>{vivienda.estrato_muestra}</div>}
        </div>
        <span className={`inline-block rounded px-2 py-1 text-sm font-bold ${est.tono}`}>{est.texto}</span>
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {miEncuestaEditable && (
        <a href={`/campo/encuesta/${encuesta.id}`} className="btn-primario w-full">
          {encuesta.estado === 'correccion' ? 'Corregir formulario devuelto' : 'Continuar formulario'}
        </a>
      )}

      {intento && !miEncuestaEditable && (
        <section className="tarjeta space-y-4">
          <h2 className="text-lg font-bold">Visita N.º {intento.numero} · {fechaHora(intento.inicio)}</h2>
          {paso === 'gps' && (
            <div className="space-y-3">
              <p className="text-sm">Ubíquese frente a la puerta principal y capture la ubicación. Se exige una precisión de {umbralGps} m o menos.</p>
              <GpsCaptura umbral={umbralGps}
                onLectura={guardarGps}
                onFallo={() => setGpsFallos((n) => n + 1)} />
              {gpsFallos >= 3 && (
                <div className="rounded-lg border border-sol bg-sol-claro p-3 text-sm">
                  <p className="font-bold">Tres intentos sin alcanzar la precisión.</p>
                  <p>Puede continuar la visita, pero el registro no se cerrará hasta que el coordinador apruebe la excepción.</p>
                  <button className="btn-secundario mt-2 w-full" onClick={solicitarExcepcion}>Solicitar excepción y continuar</button>
                </div>
              )}
            </div>
          )}
          {paso === 'resultado' && (
            <div className="space-y-3">
              {dist !== null && dist > 100 && (
                <p className="rounded-lg bg-sol-claro p-3 text-sm text-sol-oscuro">La ubicación está a {dist} m de las coordenadas de la selección muestral. Confirme que está en la vivienda correcta.</p>
              )}
              {intento.gps_excepcion === 'solicitada' && <p className="text-sm text-sol-oscuro">Excepción de ubicación solicitada al coordinador.</p>}
              <p className="font-bold">¿Alguien atiende la visita?</p>
              <button className="btn-exito w-full" onClick={atendieron} disabled={ocupado}>Sí, atienden la visita</button>
              <button className="btn-secundario w-full" onClick={marcarCerrada} disabled={ocupado}>Vivienda cerrada / sin atención</button>
              <button className="w-full text-sm text-marca underline" onClick={() => setPaso('gps')}>Volver a capturar la ubicación</button>
            </div>
          )}
          {paso === 'cerrada' && (
            <div className="space-y-3">
              <p className="font-bold">Fotografía del inmueble (obligatoria)</p>
              <FotoEvidencia campo="fachada_intento" valor={fachada} onChange={setFachada}
                ctx={{ uid, viviendaId: vivienda.id, intentoId: intento.id }} />
              <button className="btn-primario w-full" onClick={cerrarIntento} disabled={!fachada?.ruta || ocupado}>
                Guardar intento sin atención
              </button>
            </div>
          )}
        </section>
      )}

      {puedeIniciar && (
        <button className="btn-primario w-full" onClick={iniciar} disabled={ocupado}>
          Registrar visita N.º {intentos.length + 1}
        </button>
      )}
      {atendida && !miEncuestaEditable && <p className="tarjeta text-sm">La vivienda ya fue atendida. No requiere nuevas visitas.</p>}
      {estado?.estado_campo === 'no_atendida_3' && !intento && (
        <p className="tarjeta text-sm">La vivienda completó tres intentos sin atención. Una visita adicional requiere autorización del coordinador.</p>
      )}

      <section className="space-y-2">
        <h2 className="font-bold">Historial de visitas</h2>
        {intentos.length === 0 && <p className="text-sm text-slate-500">Sin visitas registradas.</p>}
        {intentos.map((i) => <FilaIntento key={i.id} i={i} />)}
      </section>
    </div>
  );
}

function FilaIntento({ i }: { i: Intento }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (i.foto_fachada) urlFirmada('evidencias', i.foto_fachada).then(setUrl); }, [i.foto_fachada]);
  const res = i.resultado === 'atendida' ? 'Atendida' : i.resultado === 'cerrada' ? 'Sin atención' : 'En curso';
  return (
    <div className="tarjeta flex gap-3">
      {url ? <img src={url} alt="" className="h-16 w-16 rounded object-cover" /> : <div className="h-16 w-16 rounded bg-slate-100" />}
      <div className="text-sm">
        <div className="font-bold">Visita {i.numero} · {res}</div>
        <div>{fechaHora(i.inicio)}</div>
        <div className="text-slate-600">
          {i.precision_m != null ? `Precisión ${i.precision_m} m` : 'Sin ubicación'}
          {i.gps_excepcion ? ` · Excepción GPS ${i.gps_excepcion}` : ''}
          {!i.cerrado ? ' · abierta' : ''}
        </div>
      </div>
    </div>
  );
}
