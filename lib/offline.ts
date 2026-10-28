'use client';
import { get, set, del, keys } from 'idb-keyval';
import { subirEvidencia, type ArchivoPendiente } from './subir';

// Almacenamiento local temporal mientras no hay conexión. Se borra al sincronizar.
export type Borrador = { respuestas: Record<string, any>; version: number; guardado: number };

export const guardarBorradorLocal = (id: string, b: Borrador) => set(`borrador:${id}`, b);
export const leerBorradorLocal = (id: string) => get<Borrador>(`borrador:${id}`);
export const borrarBorradorLocal = (id: string) => del(`borrador:${id}`);

export async function encolarArchivo(item: ArchivoPendiente) {
  await set(`archivo:${item.ruta}`, item);
}

export async function archivosPendientes(): Promise<ArchivoPendiente[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith('archivo:'));
  const items = await Promise.all(ks.map((k) => get<ArchivoPendiente>(k)));
  return items.filter(Boolean) as ArchivoPendiente[];
}

export async function sincronizarArchivos(): Promise<{ subidos: number; pendientes: number }> {
  const lista = await archivosPendientes();
  let subidos = 0;
  for (const item of lista) {
    try {
      await subirEvidencia(item);
      await del(`archivo:${item.ruta}`);
      subidos++;
    } catch {
      // Se reintenta en la próxima sincronización.
    }
  }
  return { subidos, pendientes: lista.length - subidos };
}

export async function blobPendiente(ruta: string): Promise<Blob | null> {
  const item = await get<ArchivoPendiente>(`archivo:${ruta}`);
  return item ? item.blob : null;
}
