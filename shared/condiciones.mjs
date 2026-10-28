// Lógica compartida entre la aplicación (navegador y servidor) y el trabajador de exportación.
export function vacio(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function cumple(c, r, nombradas = {}) {
  if (c === undefined || c === null || c === true) return true;
  if (c === false) return false;
  if (c.ref) {
    if (!(c.ref in nombradas)) throw new Error(`Condición desconocida: ${c.ref}`);
    return cumple(nombradas[c.ref], r, nombradas);
  }
  if (c.all) return c.all.every((x) => cumple(x, r, nombradas));
  if (c.any) return c.any.some((x) => cumple(x, r, nombradas));
  const v = r[c.f];
  if ('eq' in c) return v === c.eq;
  if ('ne' in c) return !vacio(v) && v !== c.ne || (c.ne === true && v !== true);
  if ('in' in c) return c.in.includes(v);
  if ('incluye' in c) return Array.isArray(v) && v.includes(c.incluye);
  if ('lleno' in c) return c.lleno ? !vacio(v) : vacio(v);
  throw new Error('Condición mal formada: ' + JSON.stringify(c));
}
