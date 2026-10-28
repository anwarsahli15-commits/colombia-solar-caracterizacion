import Link from 'next/link';
import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

function Cifra({ t, v, href, tono = '' }: { t: string; v: number; href?: string; tono?: string }) {
  const cuerpo = (
    <div className={`tarjeta h-full ${tono}`}>
      <div className="text-3xl font-bold tabular-nums">{(v ?? 0).toLocaleString('es-CO')}</div>
      <div className="text-sm text-slate-600">{t}</div>
    </div>
  );
  return href ? <Link href={href} className="hover:no-underline">{cuerpo}</Link> : cuerpo;
}

export default async function Panel() {
  await exigirRol(['supervisor', 'coordinador']);
  const { data: k, error } = await supabaseServidor().rpc('indicadores');
  if (error || !k) return <p className="tarjeta">No se pudieron cargar los indicadores.</p>;
  const v = '/admin/viviendas?estado=';
  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-1 text-2xl font-bold">Avance del trabajo de campo</h1>
        <p className="text-sm text-slate-600">Conteos por vivienda única, calculados en la base de datos.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Selección muestral y visitas</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cifra t="Viviendas en la selección muestral" v={k.total} />
          <Cifra t="Pendientes de visita" v={k.pendientes} href={v + 'pendiente'} />
          <Cifra t="Con 1 visita sin atención" v={k.sin_atencion_1} href={v + 'sin_atencion_1'} />
          <Cifra t="Con 2 visitas sin atención" v={k.sin_atencion_2} href={v + 'sin_atencion_2'} />
          <Cifra t="No atendidas tras 3 intentos" v={k.no_atendida_3} href={v + 'no_atendida_3'} />
          <Cifra t="Visitas efectivas (contactos)" v={k.visitas_efectivas} />
          <Cifra t="Viviendas únicas efectivas" v={k.viviendas_efectivas} tono="border-verde" />
          <Cifra t="Intentos sin atención registrados" v={k.intentos_sin_atencion} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Resultado de las viviendas atendidas</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Cifra t="Participantes" v={k.participantes} href={v + 'atendida_completa'} />
          <Cifra t="Desistimientos" v={k.desistimientos} href={v + 'atendida_desistimiento'} />
          <Cifra t="No aceptan tratamiento de datos" v={k.sin_datos} href={v + 'atendida_sin_datos'} />
          <Cifra t="Reprogramadas" v={k.reprogramadas} href={v + 'atendida_reprogramada'} />
          <Cifra t="Formularios incompletos" v={k.incompletas} href={v + 'atendida_incompleta'} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Calidad y exportación</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cifra t="Pendientes de revisión" v={k.pendientes_revision} href="/admin/revision" />
          <Cifra t="Requieren corrección" v={k.en_correccion} href="/admin/viviendas?calidad=correccion" />
          <Cifra t="Validadas por supervisor" v={k.validadas} href="/admin/revision?estado=validada" />
          <Cifra t="Aprobadas" v={k.aprobadas} />
          <Cifra t="Listas para exportar" v={k.aptas} href="/admin/paquetes" tono="border-verde" />
          <Cifra t="En paquetes en generación" v={k.en_paquete_en_proceso} />
          <Cifra t="Incluidas en paquetes exportados" v={k.exportadas} href="/admin/enviados" />
          <Cifra t="Certificados de tradición pendientes" v={k.certificados_pendientes} />
          <Cifra t="Excepciones de GPS por resolver" v={k.excepciones_gps} href="/admin/revision" />
        </div>
      </section>

      {k.devoluciones_por_motivo?.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Motivos de devolución más frecuentes</h2>
          <table className="tabla tarjeta">
            <thead><tr><th>Motivo</th><th className="w-24 text-right">Registros</th></tr></thead>
            <tbody>{k.devoluciones_por_motivo.map((d: any, i: number) => (
              <tr key={i}><td>{d.motivo}</td><td className="text-right tabular-nums">{d.total}</td></tr>
            ))}</tbody>
          </table>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-bold">Avance por barrio</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="tabla">
            <thead><tr><th>Barrio</th><th>Total</th><th>Pendientes</th><th>Sin atención</th><th>3 intentos</th><th>Efectivas</th><th>Participan</th><th>Desisten</th><th>Aptas</th><th>Exportadas</th></tr></thead>
            <tbody>{(k.por_barrio || []).map((b: any) => (
              <tr key={b.barrio} className="tabular-nums">
                <td className="font-bold">{b.barrio}</td><td>{b.total}</td><td>{b.pendientes}</td><td>{b.sin_atencion}</td><td>{b.no_atendidas}</td>
                <td>{b.efectivas}</td><td>{b.participantes}</td><td>{b.desistimientos}</td><td>{b.aptas}</td><td>{b.exportadas}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Avance por encuestador</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="tabla">
            <thead><tr><th>Encuestador</th><th>Intentos</th><th>Sin atención</th><th>Efectivas</th><th>Enviadas</th><th>En corrección</th><th>Aprobadas</th></tr></thead>
            <tbody>{(k.por_encuestador || []).map((e: any) => (
              <tr key={e.nombre} className="tabular-nums">
                <td className="font-bold">{e.nombre}</td><td>{e.intentos}</td><td>{e.sin_atencion}</td><td>{e.efectivas}</td>
                <td>{e.enviadas}</td><td>{e.en_correccion}</td><td>{e.aprobadas}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
