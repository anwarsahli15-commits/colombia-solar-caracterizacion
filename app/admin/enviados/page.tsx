import Link from 'next/link';
import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol } from '@/lib/sesion';
import { ESTADOS_PAQUETE, fechaHora } from '@/lib/estados';
import { AccionPaquete, BotonDescarga } from '@/components/admin/Acciones';

export const dynamic = 'force-dynamic';

function mb(b: number) { return `${(b / 1048576).toFixed(1)} MB`; }

export default async function Enviados({ searchParams }: { searchParams: { nuevo?: string } }) {
  await exigirRol(['coordinador']);
  const sb = supabaseServidor();
  const [{ data: paquetes }, { data: perfiles }] = await Promise.all([
    sb.from('paquete').select('*').order('creado', { ascending: false }),
    sb.from('perfil').select('id, nombre'),
  ]);
  const nombres = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p.nombre]));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Paquetes enviados</h1>
      {searchParams.nuevo && (
        <p className="rounded-lg bg-verde-claro p-3 text-sm text-green-900">
          Paquete reservado. El proceso de generación lo tomará en los próximos minutos; recargue esta página para ver su estado.
        </p>
      )}
      {(paquetes || []).length === 0 && <p className="tarjeta">Aún no hay paquetes.</p>}
      {(paquetes || []).map((p: any) => (
        <section key={p.id} className="tarjeta space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">{p.numero ? `Paquete enviado N.º ${p.numero}` : 'Paquete sin número'}</h2>
            <span className={`rounded px-2 py-1 text-sm font-bold ${p.estado === 'generado' ? 'bg-verde-claro text-green-800' : p.estado === 'fallido' ? 'bg-red-50 text-red-800' : 'bg-slate-100'}`}>
              {ESTADOS_PAQUETE[p.estado]}
            </span>
          </div>
          <dl className="grid gap-2 text-sm md:grid-cols-4">
            <div><dt className="font-bold text-slate-500">Reservado</dt><dd>{fechaHora(p.creado)}</dd></div>
            <div><dt className="font-bold text-slate-500">Generado</dt><dd>{fechaHora(p.generado_en)}</dd></div>
            <div><dt className="font-bold text-slate-500">Responsable</dt><dd>{nombres[p.creado_por]}</dd></div>
            <div><dt className="font-bold text-slate-500">Versiones</dt><dd>{p.instrumento_version} · {p.plantilla_version}</dd></div>
            <div><dt className="font-bold text-slate-500">Viviendas únicas</dt><dd>{p.conteos?.viviendas}</dd></div>
            <div><dt className="font-bold text-slate-500">Participantes</dt><dd>{p.conteos?.participantes}</dd></div>
            <div><dt className="font-bold text-slate-500">Desistimientos</dt><dd>{p.conteos?.desistimientos}</dd></div>
            <div><dt className="font-bold text-slate-500">No aceptan datos</dt><dd>{p.conteos?.sin_datos}</dd></div>
          </dl>
          {p.estado === 'generado' && (
            <div className="space-y-2">
              <div className="text-sm font-bold">Archivos</div>
              <div className="flex flex-wrap gap-2">
                {(p.archivos || []).map((a: any) => (
                  <BotonDescarga key={a.ruta} ruta={a.ruta} texto={`${a.nombre} (${mb(a.bytes)})`} />
                ))}
              </div>
              {p.verificacion?.resumen && <p className="text-sm text-green-800">Verificación: {p.verificacion.resumen}</p>}
            </div>
          )}
          {p.estado === 'fallido' && (
            <div className="space-y-2">
              <p className="rounded bg-red-50 p-2 text-sm text-red-800">{p.error}</p>
              <AccionPaquete paqueteId={p.id} />
            </div>
          )}
          <Link href={`/admin/enviados/${p.id}`} className="text-sm font-bold">Ver viviendas del paquete</Link>
        </section>
      ))}
    </div>
  );
}
