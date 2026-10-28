import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { leerConfig } from '@/lib/sesion';
import instrumento from '@/shared/instrumento-f5-v1.json';
import { evaluar, camposArchivo } from '@/shared/validacion.mjs';
import { hoyBogota } from '@/lib/estados';

// Validación definitiva en el servidor. El navegador nunca puede marcar una encuesta como enviada.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const sb = supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ mensaje: 'Sesión vencida. Ingrese de nuevo.' }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ mensaje: 'Solicitud inválida.' }, { status: 400 }); }
  const respuestas = body?.respuestas;
  const version = Number(body?.version);
  if (!respuestas || typeof respuestas !== 'object' || Array.isArray(respuestas) || !Number.isInteger(version)) {
    return NextResponse.json({ mensaje: 'Solicitud inválida.' }, { status: 400 });
  }
  if (JSON.stringify(respuestas).length > 200_000) return NextResponse.json({ mensaje: 'Formulario demasiado grande.' }, { status: 413 });

  // Lectura con la sesión del usuario: RLS garantiza que solo vea sus encuestas.
  const { data: enc } = await sb.from('encuesta')
    .select('id, estado, version, encuestador_id, vivienda_id, intento_id').eq('id', params.id).maybeSingle();
  if (!enc || enc.encuestador_id !== user.id) return NextResponse.json({ mensaje: 'Encuesta no encontrada.' }, { status: 404 });
  if (!['borrador', 'correccion'].includes(enc.estado)) return NextResponse.json({ mensaje: 'La encuesta ya fue enviada.' }, { status: 409 });
  if (enc.version !== version) return NextResponse.json({ mensaje: 'La encuesta cambió en otro dispositivo. Recargue la página.' }, { status: 409 });

  const [{ data: vivienda }, { data: intento }, { data: evidencias }, config] = await Promise.all([
    sb.from('vivienda').select('consumo_muestra, estrato_muestra').eq('id', enc.vivienda_id).single(),
    sb.from('intento_visita').select('lat, lon, precision_m, gps_excepcion').eq('id', enc.intento_id).single(),
    sb.from('evidencia').select('ruta').eq('encuesta_id', enc.id),
    leerConfig(sb),
  ]);

  const res = evaluar(instrumento, respuestas, { config, vivienda, hoy: hoyBogota() });
  const errores: Record<string, string> = { ...res.errores };
  for (const k of res.alertasPendientes) errores[k] = errores[k] || 'Confirme el valor marcado como inusual.';

  const rutas = new Set((evidencias || []).map((e: any) => e.ruta));
  for (const c of camposArchivo(instrumento)) {
    const v = respuestas[c.id];
    if (res.visibles.has(c.id) && v?.ruta && !rutas.has(v.ruta)) {
      errores[c.id] = 'El archivo no terminó de subir. Conéctese a internet y reintente.';
    }
  }
  const umbral = Math.min(Number(config.umbrales?.gps_precision_m ?? 4), 4);
  const gpsOk = (intento?.lat != null && intento?.precision_m != null && intento.precision_m <= umbral) || intento?.gps_excepcion === 'aprobada';
  if (!gpsOk) errores._gps = `La ubicación no cumple la precisión exigida (≤ ${umbral} m) y no hay excepción aprobada.`;
  if (!res.ruta) errores._ruta = 'No se pudo determinar el resultado de la visita.';

  if (Object.keys(errores).length) {
    return NextResponse.json({ mensaje: 'El formulario tiene campos por corregir.', errores }, { status: 422 });
  }

  const { error } = await supabaseAdmin().rpc('registrar_envio', {
    p_encuesta: enc.id, p_usuario: user.id, p_version: version, p_respuestas: res.respuestasLimpias, p_ruta: res.ruta,
  });
  if (error) {
    const conflicto = error.message.includes('CONFLICTO');
    console.error('registrar_envio', enc.id, error.code);
    return NextResponse.json({ mensaje: conflicto ? 'La encuesta cambió en otro dispositivo. Recargue la página.' : 'No se pudo registrar el envío.' }, { status: conflicto ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, ruta: res.ruta });
}
