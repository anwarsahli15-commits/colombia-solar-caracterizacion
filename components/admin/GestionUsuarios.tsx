'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';

export default function GestionUsuarios({ perfiles, barrios, asignaciones }: { perfiles: any[]; barrios: any[]; asignaciones: any[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ nombre: '', correo: '', rol: 'encuestador', clave: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const sb = supabaseNavegador();

  async function crear(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setError('');
    const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.mensaje || 'No se pudo crear el usuario.'); return; }
    setMsg(`Usuario creado. Entregue la contraseña temporal a ${form.nombre} por un canal privado.`);
    setForm({ nombre: '', correo: '', rol: 'encuestador', clave: '' });
    router.refresh();
  }

  async function activo(id: string, v: boolean) {
    const { error } = await sb.from('perfil').update({ activo: v }).eq('id', id);
    if (error) setError(error.message); else router.refresh();
  }

  async function asignar(enc: string, barrio: number, on: boolean) {
    const { error } = on
      ? await sb.from('asignacion').insert({ encuestador_id: enc, barrio_id: barrio })
      : await sb.from('asignacion').delete().eq('encuestador_id', enc).eq('barrio_id', barrio);
    if (error) setError(error.message); else router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={crear} className="tarjeta grid gap-3 md:grid-cols-5">
        <input className="campo-input" placeholder="Nombre completo" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <input className="campo-input" type="email" placeholder="Correo" required value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} />
        <select className="campo-input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
          <option value="encuestador">Encuestador</option><option value="supervisor">Supervisor</option><option value="coordinador">Coordinador</option>
        </select>
        <input className="campo-input" type="text" placeholder="Contraseña temporal (mín. 10)" minLength={10} required autoComplete="new-password"
          value={form.clave} onChange={(e) => setForm({ ...form, clave: e.target.value })} />
        <button className="btn-primario">Crear usuario</button>
      </form>
      {msg && <p className="rounded-lg bg-verde-claro p-3 text-sm text-green-900">{msg}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="tabla">
          <thead><tr><th>Nombre</th><th>Rol</th><th>Barrios asignados</th><th>Estado</th></tr></thead>
          <tbody>{perfiles.map((p) => {
            const asig = asignaciones.filter((a) => a.encuestador_id === p.id).map((a) => a.barrio_id);
            return (
              <tr key={p.id}>
                <td className="font-bold">{p.nombre}</td>
                <td>{p.rol}</td>
                <td>
                  {p.rol === 'encuestador' ? (
                    <div>
                      <button className="text-sm font-bold text-marca underline" onClick={() => setAbierto(abierto === p.id ? null : p.id)}>
                        {asig.length} barrios · {abierto === p.id ? 'cerrar' : 'editar'}
                      </button>
                      {abierto === p.id && (
                        <div className="mt-2 grid max-h-64 gap-1 overflow-y-auto md:grid-cols-2">
                          {barrios.map((b) => (
                            <label key={b.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={asig.includes(b.id)} onChange={(e) => asignar(p.id, b.id, e.target.checked)} />{b.nombre}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : 'Todos'}
                </td>
                <td>
                  <button className="btn-secundario min-h-[36px] text-sm" onClick={() => activo(p.id, !p.activo)}>{p.activo ? 'Activo · desactivar' : 'Inactivo · activar'}</button>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
