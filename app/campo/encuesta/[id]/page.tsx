import { notFound } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol, leerConfig } from '@/lib/sesion';
import FormularioEncuesta from '@/components/campo/FormularioEncuesta';

export default async function Encuesta({ params }: { params: { id: string } }) {
  const perfil = await exigirRol(['encuestador', 'supervisor', 'coordinador']);
  const sb = supabaseServidor();
  const { data: encuesta } = await sb.from('encuesta')
    .select('id, codigo_registro, vivienda_id, intento_id, encuestador_id, estado, ruta, respuestas, version, actualizado')
    .eq('id', params.id).maybeSingle();
  if (!encuesta) notFound();
  const [{ data: vivienda }, { data: intento }, { data: revisiones }, config] = await Promise.all([
    sb.from('vivienda').select('id, niu, direccion, estrato_muestra, consumo_muestra').eq('id', encuesta.vivienda_id).single(),
    sb.from('intento_visita').select('precision_m, lat, gps_excepcion').eq('id', encuesta.intento_id).single(),
    sb.from('revision').select('accion, observacion, creado').eq('encuesta_id', encuesta.id).order('creado'),
    leerConfig(sb),
  ]);
  const umbral = Math.min(Number(config.umbrales?.gps_precision_m ?? 4), 4);
  const gpsOk = (intento?.lat != null && intento?.precision_m != null && intento.precision_m <= umbral) || intento?.gps_excepcion === 'aprobada';
  return (
    <FormularioEncuesta encuesta={encuesta} vivienda={vivienda} config={config} revisiones={revisiones || []}
      uid={perfil.id} gpsOk={gpsOk} />
  );
}
