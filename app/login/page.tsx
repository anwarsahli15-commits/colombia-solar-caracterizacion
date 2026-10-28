'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Suspense } from 'react';

function Formulario() {
  const params = useSearchParams();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState(params.get('motivo') === 'perfil'
    ? 'Su usuario no tiene un perfil activo. Contacte al coordinador.' : '');
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError('');
    const { error } = await supabaseNavegador().auth.signInWithPassword({ email: correo.trim(), password: clave });
    if (error) {
      setError('Correo o contraseña incorrectos.');
      setCargando(false);
      return;
    }
    window.location.href = '/';
  }

  return (
    <form onSubmit={entrar} className="tarjeta w-full max-w-sm space-y-4">
      <div>
        <label className="etiqueta" htmlFor="correo">Correo</label>
        <input id="correo" className="campo-input" type="email" autoComplete="username" required
          value={correo} onChange={(e) => setCorreo(e.target.value)} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="clave">Contraseña</label>
        <input id="clave" className="campo-input" type="password" autoComplete="current-password" required
          value={clave} onChange={(e) => setClave(e.target.value)} />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button className="btn-primario w-full" disabled={cargando}>{cargando ? 'Ingresando…' : 'Ingresar'}</button>
      <p className="text-xs text-slate-500">Las cuentas las crea el coordinador del proyecto.</p>
    </form>
  );
}

export default function Login() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex items-center gap-6">
        <img src="/logos/logo-gecelca.png" alt="GECELCA" className="h-8" />
        <img src="/logos/logo-colombia-solar.png" alt="Colombia Solar" className="h-12" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold">Caracterización de usuarios</h1>
        <p className="text-slate-600">Formato 5 · Soluciones individuales</p>
      </div>
      <Suspense>
        <Formulario />
      </Suspense>
    </main>
  );
}
