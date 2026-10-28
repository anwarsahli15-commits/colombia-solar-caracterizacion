import Encabezado from '@/components/Encabezado';
import { exigirRol } from '@/lib/sesion';

export default async function CampoLayout({ children }: { children: React.ReactNode }) {
  const perfil = await exigirRol(['encuestador', 'supervisor', 'coordinador']);
  return (
    <>
      <Encabezado perfil={perfil} inicio="/campo" />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">{children}</main>
    </>
  );
}
