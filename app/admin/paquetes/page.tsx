import { exigirRol } from '@/lib/sesion';
import SelectorPaquete from '@/components/admin/SelectorPaquete';

export const dynamic = 'force-dynamic';

export default async function Paquetes() {
  await exigirRol(['coordinador']);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Gestión de paquetes</h1>
      <p className="max-w-3xl text-sm text-slate-600">
        Solo aparecen viviendas únicas efectivas con la encuesta aprobada que no están en otro paquete.
        Un paquete ordinario tiene exactamente 500 viviendas. Las viviendas cerradas nunca se incluyen.
      </p>
      <SelectorPaquete />
    </div>
  );
}
