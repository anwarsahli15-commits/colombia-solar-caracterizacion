export const ESTADOS_CAMPO: Record<string, { texto: string; tono: string }> = {
  pendiente: { texto: 'Pendiente de visita', tono: 'bg-slate-100 text-slate-700' },
  sin_atencion_1: { texto: '1.ª visita sin atención', tono: 'bg-sol-claro text-sol-oscuro' },
  sin_atencion_2: { texto: '2.ª visita sin atención', tono: 'bg-sol-claro text-sol-oscuro' },
  no_atendida_3: { texto: 'No atendida tras 3 intentos', tono: 'bg-red-50 text-red-800' },
  atendida_completa: { texto: 'Atendida: participa', tono: 'bg-verde-claro text-green-800' },
  atendida_desistimiento: { texto: 'Atendida: desistimiento', tono: 'bg-marca-claro text-marca-oscuro' },
  atendida_sin_datos: { texto: 'Atendida: no acepta datos', tono: 'bg-marca-claro text-marca-oscuro' },
  atendida_reprogramada: { texto: 'Atendida: reprogramada', tono: 'bg-sol-claro text-sol-oscuro' },
  atendida_incompleta: { texto: 'Atendida: formulario incompleto', tono: 'bg-orange-50 text-orange-800' },
  atendida_otro: { texto: 'Atendida por otro encuestador', tono: 'bg-slate-100 text-slate-700' },
};

export const ESTADOS_CALIDAD: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Pendiente de revisión',
  correccion: 'Requiere corrección',
  validada: 'Validada por supervisor',
  aprobada: 'Aprobada para exportar',
  anulada: 'Anulada',
};

export const ESTADOS_PAQUETE: Record<string, string> = {
  en_cola: 'En cola de generación',
  generando: 'Generando archivos',
  generado: 'Generado y verificado',
  fallido: 'Falló la generación',
  liberado: 'Liberado (viviendas disponibles)',
};

export function fechaHora(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
}

export function hoyBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}
