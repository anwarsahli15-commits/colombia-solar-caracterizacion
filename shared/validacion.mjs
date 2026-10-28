import { cumple, vacio } from './condiciones.mjs';

export const TIPOS_ARCHIVO = ['foto', 'documento', 'firma'];
export const esArchivo = (c) => TIPOS_ARCHIVO.includes(c.tipo);
const TIPOS_SIN_VALOR = ['aviso', 'aviso_texto_datos'];
const ESTRATO_MUESTRA = { 'bajo - bajo': '1', 'bajo': '2', 'medio - bajo': '3', 'medio': '4', 'medio - alto': '5', 'alto': '6' };

export function validarCorreo(s) {
  const partes = s.split('@');
  if (partes.length !== 2) return 'El correo debe tener un único símbolo @.';
  const [u, d] = partes;
  if (!u || /\s/.test(s)) return 'El correo no es válido: no debe tener espacios.';
  if (!/^[A-Za-z0-9._%+-]+$/.test(u) || u.startsWith('.') || u.endsWith('.') || u.includes('..'))
    return 'La parte antes de @ contiene caracteres no válidos.';
  if (!/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/.test(d))
    return 'El dominio del correo no es válido (ejemplo: nombre@dominio.com).';
  return null;
}

export function validarFormato(tipo, v) {
  const s = String(v ?? '').trim();
  switch (tipo) {
    case 'nombre':
      if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,80}$/.test(s) || !/[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}/.test(s))
        return 'Escriba el nombre solo con letras (sin números ni símbolos).';
      return null;
    case 'documento':
      return /^\d{5,12}$/.test(s) ? null : 'El número de identificación debe tener solo dígitos, sin puntos ni espacios (entre 5 y 12).';
    case 'digitos':
      return /^\d{1,20}$/.test(s) ? null : 'Solo se permiten números.';
    case 'correo':
      return s.toLowerCase() === 'no tiene' ? null : validarCorreo(s);
    case 'telefono':
      if (/^3\d{9}$/.test(s) || /^60\d{8}$/.test(s)) return null;
      return 'El número de celular debe tener 10 dígitos y comenzar por 3 (un fijo debe tener 10 dígitos y comenzar por 60).';
    case 'matricula':
      if (s.toUpperCase() === 'NO TIENE') return null;
      return /^\d{3}-\d{1,8}$/.test(s) ? null : 'La matrícula debe tener el formato 040-123456, o escriba «NO TIENE».';
    default:
      return null;
  }
}

export function derivarRuta(r) {
  if (r.mayor_edad === 'NO') return 'reprogramada';
  if (r.mayor_edad !== 'SI') return null;
  if (r.acepta_datos === 'NO') return 'sin_datos';
  if (r.acepta_datos !== 'SI') return null;
  if (r.participa === 'NO') return 'desistimiento';
  if (r.participa !== 'SI') return null;
  if (r.relacion && r.relacion !== 'Propietario' && r.autorizacion === 'NO') return 'reprogramada';
  return 'completa';
}

export const ETIQUETA_RUTA = {
  completa: 'Atendida: participa',
  desistimiento: 'Atendida: desistimiento de participación',
  sin_datos: 'Atendida: no acepta tratamiento de datos',
  reprogramada: 'Atendida: visita reprogramada',
};

function validarValor(c, v, ctx) {
  if (c.tipo === 'sino') return ['SI', 'NO'].includes(v) ? null : 'Seleccione Sí o No.';
  if (c.tipo === 'lista') return c.opciones.includes(v) ? null : 'Seleccione una opción de la lista.';
  if (c.tipo === 'multi')
    return Array.isArray(v) && v.every((x) => c.opciones.includes(x)) ? null : 'Seleccione opciones de la lista.';
  if (c.tipo === 'entero') {
    if (typeof v !== 'number' || !Number.isInteger(v)) return 'Escriba un número entero, sin puntos ni comas.';
    if (c.min !== undefined && v < c.min) return `El valor mínimo es ${c.min}.`;
    if (c.max !== undefined && v > c.max) return `El valor máximo es ${c.max.toLocaleString('es-CO')}.`;
    return null;
  }
  if (c.tipo === 'fecha') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return 'Seleccione una fecha válida.';
    if (ctx.hoy && v <= ctx.hoy) return 'La fecha de la nueva visita debe ser posterior a hoy.';
    return null;
  }
  if (c.tipo === 'texto') {
    if (typeof v !== 'string' || !v.trim()) return 'Este campo es obligatorio.';
    if (v.length > (c.largo ? 2000 : 300)) return 'El texto es demasiado largo.';
    return c.validar ? validarFormato(c.validar, v) : null;
  }
  if (esArchivo(c)) return v && typeof v === 'object' && v.ruta ? null : 'Falta la evidencia.';
  return null;
}

/**
 * Evalúa un formulario completo: visibilidad, obligatoriedad, errores, alertas y ruta.
 * ctx: { config: { umbrales }, vivienda: { consumo_muestra, estrato_muestra }, hoy: 'AAAA-MM-DD' }
 */
export function evaluar(instr, r, ctx = {}) {
  const nom = instr.condiciones;
  const umb = (ctx.config && ctx.config.umbrales) || {};
  const visibles = new Set();
  const requeridos = new Set();
  const seccionesVisibles = new Set();
  const errores = {};
  const alertas = {};
  const porSeccion = {};
  const seccionDe = {};
  const ocultosConValor = [];

  for (const s of instr.secciones) {
    const sv = cumple(s.si, r, nom);
    if (sv) seccionesVisibles.add(s.id);
    let total = 0;
    let ok = 0;
    for (const c of s.campos) {
      seccionDe[c.id] = s.id;
      const vis = sv && cumple(c.si, r, nom);
      if (!vis) {
        if (!TIPOS_SIN_VALOR.includes(c.tipo) && !vacio(r[c.id]) && r[c.id] !== false) ocultosConValor.push(c.id);
        continue;
      }
      visibles.add(c.id);
      if (TIPOS_SIN_VALOR.includes(c.tipo)) continue;
      const req = c.req === true || (!!c.req && typeof c.req === 'object' && cumple(c.req, r, nom));
      if (req) { requeridos.add(c.id); total++; }
      const v = r[c.id];
      if (c.tipo === 'check') {
        if (req && v !== true) errores[c.id] = 'Debe marcar esta casilla para continuar.';
        else if (req) ok++;
        continue;
      }
      if (vacio(v)) {
        if (req) errores[c.id] = esArchivo(c) ? 'Falta la evidencia obligatoria.' : 'Este campo es obligatorio.';
        continue;
      }
      const e = validarValor(c, v, ctx) || (c.debe && v !== c.debe
        ? 'Para enviar, este punto debe cumplirse. Revise y corrija el formulario.' : null);
      if (e) errores[c.id] = e;
      else if (req) ok++;
    }
    porSeccion[s.id] = { total, ok, errores: 0 };
  }

  const n = (k) => (visibles.has(k) && typeof r[k] === 'number' ? r[k] : null);
  const personas = n('personas_medidor');
  if (personas !== null) {
    const suma = (n('menores_medidor') || 0) + (n('adultos_mayores_medidor') || 0);
    if (suma > personas && !errores.adultos_mayores_medidor)
      errores.adultos_mayores_medidor = `La suma de menores y adultos mayores (${suma}) supera las personas por medidor (${personas}).`;
    const disc = n('miembros_discapacidad');
    if (disc !== null && disc > personas && !errores.miembros_discapacidad)
      errores.miembros_discapacidad = `No puede superar las personas por medidor (${personas}).`;
    const ruv = n('ruv_personas');
    if (ruv !== null && ruv > personas && !errores.ruv_personas)
      errores.ruv_personas = `No puede superar las personas por medidor (${personas}).`;
    const pmax = umb.personas_max ?? 20;
    if (personas > pmax) alertas.personas_medidor = `Valor inusual: más de ${pmax} personas por medidor. Confirme el dato con la persona.`;
  }
  if (visibles.has('miembros_discapacidad') && r.miembros_discapacidad === 0 && !errores.miembros_discapacidad)
    errores.miembros_discapacidad = 'Si hay algún miembro con discapacidad, el número debe ser al menos 1.';

  const prom = n('consumo_promedio');
  if (prom !== null && !errores.consumo_promedio) {
    const max = umb.consumo_max_kwh ?? 400;
    const des = umb.consumo_desviacion ?? 0.5;
    const muestra = Number(ctx.vivienda && ctx.vivienda.consumo_muestra);
    const msgs = [];
    if (prom > max) msgs.push('El consumo ingresado es inusualmente alto. Verifica el valor directamente en la factura antes de continuar.');
    if (muestra > 0 && Math.abs(prom - muestra) / muestra > des)
      msgs.push(`Difiere más del ${Math.round(des * 100)} % del promedio de la selección muestral (${muestra} kWh).`);
    if (msgs.length) alertas.consumo_promedio = msgs.join(' ');
  }
  if (visibles.has('estrato') && r.estrato && ctx.vivienda && ctx.vivienda.estrato_muestra) {
    const esperado = ESTRATO_MUESTRA[String(ctx.vivienda.estrato_muestra).trim().toLowerCase()];
    if (esperado && esperado !== r.estrato)
      alertas.estrato = `La selección muestral registra estrato ${esperado} (${ctx.vivienda.estrato_muestra}). Verifique la factura.`;
  }

  const conf = (r._conf && typeof r._conf === 'object') ? r._conf : {};
  const alertasPendientes = Object.keys(alertas).filter((k) => conf[k] !== r[k]);

  for (const k of Object.keys(errores)) if (porSeccion[seccionDe[k]]) porSeccion[seccionDe[k]].errores++;

  const respuestasLimpias = {};
  for (const k of visibles) if (r[k] !== undefined) respuestasLimpias[k] = r[k];
  const confLimpia = {};
  for (const k of Object.keys(alertas)) if (conf[k] !== undefined) confLimpia[k] = conf[k];
  if (Object.keys(confLimpia).length) respuestasLimpias._conf = confLimpia;

  let total = 0, ok = 0;
  for (const s of Object.values(porSeccion)) { total += s.total; ok += s.ok; }
  const ruta = derivarRuta(r);
  return {
    visibles, requeridos, seccionesVisibles, errores, alertas, alertasPendientes, porSeccion,
    seccionDe, ocultosConValor, respuestasLimpias, ruta,
    completo: Object.keys(errores).length === 0 && alertasPendientes.length === 0 && !!ruta,
    progreso: { total, ok, pct: total ? Math.round((ok / total) * 100) : 0 },
  };
}

export function camposArchivo(instr) {
  const out = [];
  for (const s of instr.secciones) for (const c of s.campos) if (esArchivo(c)) out.push(c);
  return out;
}

export function campoPorId(instr) {
  const m = {};
  for (const s of instr.secciones) for (const c of s.campos) m[c.id] = { ...c, seccion: s.id };
  return m;
}
