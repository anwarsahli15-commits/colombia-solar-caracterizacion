import Link from 'next/link';
import type { Perfil } from '@/lib/sesion';

const NOMBRE_ROL = { encuestador: 'Encuestador', supervisor: 'Supervisor', coordinador: 'Coordinador' };

export default function Encabezado({ perfil, inicio }: { perfil: Perfil; inicio: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <Link href={inicio} className="flex items-center gap-3 hover:no-underline">
          <img src="/logos/logo-colombia-solar.png" alt="Colombia Solar" className="h-8" />
          <span className="hidden text-sm font-bold text-slate-600 sm:inline">Caracterización</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-sm font-bold">{perfil.nombre}</div>
            <div className="text-xs text-slate-500">{NOMBRE_ROL[perfil.rol]}</div>
          </div>
          <form action="/salir" method="post">
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold hover:bg-slate-50">Salir</button>
          </form>
        </div>
      </div>
    </header>
  );
}
