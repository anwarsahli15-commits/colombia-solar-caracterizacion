import { notFound } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol, leerConfig } from '@/lib/sesion';
import PanelVivienda from '@/components/campo/PanelVivienda';

export default async function Vivienda({ params }: { params: { id: string } }) {
  const perfil = await exigirRol(['encuestador', 'supervisor', 'coordinador']);
  const sb = supabaseServidor();
  const { data: vivienda } = await sb
    .from('vivienda')
    .select('id, niu, direccion, estrato_muestra, lat_muestra, lon_muestra, barrio:barrio_id(nombre)')
    .eq('id', params.id)
    .maybeSingle();
  if (!vivienda) notFound();
  const [{ data: estado }, { data: intentos }, { data: encuesta }, config] = await Promise.all([
    sb.from('v_vivienda_estado').select('estado_campo, sin_atencion').eq('id', params.id).maybeSingle(),
    sb.from('intento_visita').select('id, numero, inicio, resultado, precision_m, foto_fachada, cerrado, encuestador_id, gps_excepcion, lat, lon, gps_intentos')
      .eq('vivienda_id', params.id).order('numero'),
    sb.from('encuesta').select('id, estado, ruta, encuestador_id, intento_id').eq('vivienda_id', params.id).eq('vigente', true).maybeSingle(),
    leerConfig(sb),
  ]);
  return (
    <PanelVivienda
      vivienda={vivienda}
      estado={estado}
      intentos={intentos || []}
      encuesta={encuesta}
      uid={perfil.id}
      umbralGps={Math.min(Number(config.umbrales?.gps_precision_m ?? 4), 4)}
    />
  );
}
