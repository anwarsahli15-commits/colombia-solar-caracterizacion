// Detiene cualquier operación de base de datos si el proyecto enlazado no es el de Colombia Solar.
// Uso: npm run verificar-proyecto (se ejecuta automáticamente antes de `npm run db:push`).
import fs from 'node:fs';

const esperado = fs.readFileSync(new URL('../supabase/PROYECTO_ESPERADO', import.meta.url), 'utf8').trim();
let enlazado = '';
try {
  enlazado = fs.readFileSync(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8').trim();
} catch {
  console.error('No hay un proyecto enlazado. Ejecute: supabase link --project-ref ' + esperado);
  process.exit(1);
}
if (!/^[a-z0-9]{20}$/.test(esperado)) {
  console.error('supabase/PROYECTO_ESPERADO no contiene una referencia válida.');
  process.exit(1);
}
if (enlazado !== esperado) {
  console.error(`DETENIDO: el proyecto enlazado (${enlazado}) no es el proyecto de Colombia Solar (${esperado}).`);
  console.error('No se ejecutará ninguna migración. Revise el enlace con: supabase link --project-ref ' + esperado);
  process.exit(1);
}
console.log(`Proyecto verificado: ${esperado}`);
