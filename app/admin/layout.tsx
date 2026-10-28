import Link from 'next/link';
import Encabezado from '@/components/Encabezado';
import { exigirRol } from '@/lib/sesion';

const NAV = [
  { href: '/admin', t: 'Panel', roles: ['supervisor', 'coordinador'] },
  { href: '/admin/viviendas', t: 'Viviendas', roles: ['supervisor', 'coordinador'] },
  { href: '/admin/revision', t: 'Revisión', roles: ['supervisor', 'coordinador'] },
  { href: '/admin/paquetes', t: 'Gestión de paquetes', roles: ['coordinador'] },
  { href: '/admin/enviados', t: 'Paquetes enviados', roles: ['coordinador'] },
  { href: '/admin/importar', t: 'Selección muestral', roles: ['coordinador'] },
  { href: '/admin/usuarios', t: 'Usuarios', roles: ['coordinador'] },
  { href: '/admin/configuracion', t: 'Configuración', roles: ['coordinador'] },
  { href: '/campo', t: 'Trabajo de campo', roles: ['supervisor', 'coordinador'] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perfil = await exigirRol(['supervisor', 'coordinador']);
  return (
    <>
      <Encabezado perfil={perfil} inicio="/admin" />
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">
          {NAV.filter((n) => n.roles.includes(perfil.rol)).map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 hover:no-underline">
              {n.t}
            </Link>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
