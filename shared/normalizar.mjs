// Normalización de direcciones para búsqueda. Nunca reemplaza la dirección oficial almacenada.
const SINONIMOS = [
  [/\b(CALLE|CLL|CALL|CL)\b/g, 'CL'],
  [/\b(CARRERA|CARR|CRA|KRA|KR|CR|CRR)\b/g, 'CR'],
  [/\b(DIAGONAL|DIAG|DG)\b/g, 'DG'],
  [/\b(TRANSVERSAL|TRANSV|TRANS|TV|TR)\b/g, 'TV'],
  [/\b(AVENIDA|AVDA|AV)\b/g, 'AV'],
  [/\b(MANZANA|MZA|MZ)\b/g, 'MZ'],
  [/\b(CASA|CS)\b/g, 'CS'],
  [/\b(APARTAMENTO|APTO|APT|AP)\b/g, 'AP'],
  [/\b(SUR)\b/g, 'S'],
  [/\b(NUMERO|NRO|NO)\b/g, ' '],
];

export function normalizarDireccion(s) {
  let t = String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[#°º,.;:_/\\]/g, ' ')
    .replace(/-/g, ' ');
  // Separa número y vía pegados: "11SUR" -> "11 SUR", "CL50" -> "CL 50"
  t = t.replace(/(\d)(SUR)\b/g, '$1 $2').replace(/\b([A-Z]{2,})(\d)/g, '$1 $2');
  for (const [re, rep] of SINONIMOS) t = t.replace(re, rep);
  t = t.replace(/\s+/g, ' ').trim();
  // Une número con su letra o sufijo: "15 S" -> "15S", "50 C" -> "50C", "6 BIS" -> "6BIS"
  t = t.replace(/(\d)\s+([A-Z]S?|BIS)(?=\s|$)/g, '$1$2');
  t = t.replace(/(\d[A-Z]?)\s+(S)(?=\s|$)/g, '$1$2');
  return t.replace(/\s+/g, ' ').trim();
}

export function nombreSeguro(s, max = 80) {
  return String(s || 'SIN_NOMBRE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, ' ')
    .trim().replace(/\s+/g, '_')
    .slice(0, max) || 'SIN_NOMBRE';
}
