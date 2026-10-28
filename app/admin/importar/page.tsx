import { supabaseServidor } from '@/lib/supabase/server';
import { exigirRol } from '@/lib/sesion';
import { fechaHora } from '@/lib/estados';
import Importador from '@/components/admin/Importador';

export const dynamic = 'force-dynamic';

export default async function Importar() {
  await exigirRol(['coordinador']);
  const sb = supabaseServidor();
  const [{ data: historial }, { count }] = await Promise.all([
    sb.from('importacion').select('*').order('creado', { ascending: false }).limit(20),
    sb.from('vivienda').select('id', { count: 'exact', head: true }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Selección muestral</h1>
        <p className="text-sm text-slate-600">{(count || 0).toLocaleString('es-CO')} viviendas cargadas. Las viviendas ya existentes (mismo NIU) nunca se sobrescriben.</p>
      </div>
      <Importador />
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Historial de importaciones</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Archivo</th><th>Leídas</th><th>Nuevas</th><th>Ya existían</th><th>Rechazadas</th><th>Estado</th></tr></thead>
            <tbody>{(historial || []).map((h: any) => (
              <tr key={h.id} className="tabular-nums">
                <td className="whitespace-nowrap">{fechaHora(h.creado)}</td><td>{h.archivo}</td><td>{h.leidas}</td><td>{h.aceptadas}</td>
                <td>{h.existentes}</td><td>{h.rechazadas}</td><td>{h.estado}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
