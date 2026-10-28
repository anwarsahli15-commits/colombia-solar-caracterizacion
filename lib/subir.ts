'use client';
import { supabaseNavegador } from './supabase/client';

export type ArchivoPendiente = {
  ruta: string;
  blob: Blob;
  mime: string;
  sha256: string;
  campo: string;
  viviendaId: string;
  encuestaId?: string | null;
  intentoId?: string | null;
  metadatos: Record<string, any>;
};

export async function sha256(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Reduce el tamaño conservando legibilidad: lado mayor 2000 px, JPEG 82 %.
export async function comprimirImagen(file: Blob, max = 2000, calidad = 0.82) {
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', calidad));
  return { blob, ancho: canvas.width, alto: canvas.height, anchoOriginal: bmp.width, altoOriginal: bmp.height };
}

export function rutaEvidencia(uid: string, viviendaId: string, grupo: string, campo: string, hash: string, mime: string) {
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  return `${uid}/${viviendaId}/${grupo}/${campo}_${hash.slice(0, 16)}.${ext}`;
}

// Idempotente: reintentar con el mismo archivo no duplica el objeto ni el registro.
export async function subirEvidencia(a: ArchivoPendiente) {
  const sb = supabaseNavegador();
  const { error: eSubida } = await sb.storage.from('evidencias').upload(a.ruta, a.blob, { contentType: a.mime, upsert: false });
  if (eSubida && !/exist|duplicate/i.test(eSubida.message)) throw new Error('No se pudo subir el archivo: ' + eSubida.message);
  const { error } = await sb.from('evidencia').upsert(
    {
      vivienda_id: a.viviendaId,
      encuesta_id: a.encuestaId ?? null,
      intento_id: a.intentoId ?? null,
      campo: a.campo,
      ruta: a.ruta,
      mime: a.mime,
      bytes: a.blob.size,
      sha256: a.sha256,
      metadatos: a.metadatos,
    },
    { onConflict: 'ruta', ignoreDuplicates: true },
  );
  if (error) throw new Error('No se pudo registrar la evidencia: ' + error.message);
}

export async function urlFirmada(bucket: string, ruta: string, segundos = 300) {
  const { data, error } = await supabaseNavegador().storage.from(bucket).createSignedUrl(ruta, segundos);
  if (error) return null;
  return data.signedUrl;
}
