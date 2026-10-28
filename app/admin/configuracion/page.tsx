import { exigirRol, leerConfig } from '@/lib/sesion';
import Configuracion from '@/components/admin/Configuracion';

export const dynamic = 'force-dynamic';

export default async function Pagina() {
  await exigirRol(['coordinador']);
  const config = await leerConfig();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Configuración</h1>
      <Configuracion inicial={config} />
    </div>
  );
}
