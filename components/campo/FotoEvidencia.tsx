'use client';
import { useEffect, useRef, useState } from 'react';
import { comprimirImagen, rutaEvidencia, sha256, subirEvidencia, urlFirmada } from '@/lib/subir';
import { encolarArchivo, blobPendiente } from '@/lib/offline';

export type ValorArchivo = { ruta: string; sha256: string; mime: string; pendiente?: boolean } | null;
export type ContextoArchivo = { uid: string; viviendaId: string; encuestaId?: string | null; intentoId?: string | null };

const MAX_BYTES = 15 * 1024 * 1024;

export default function FotoEvidencia({ campo, valor, onChange, ctx, aceptaPdf, deshabilitado }: {
  campo: string;
  valor: ValorArchivo;
  onChange: (v: ValorArchivo) => void;
  ctx: ContextoArchivo;
  aceptaPdf?: boolean;
  deshabilitado?: boolean;
}) {
  const [vista, setVista] = useState<string | null>(null);
  const [estado, setEstado] = useState<'' | 'procesando' | 'subiendo' | 'error'>('');
  const [aviso, setAviso] = useState('');
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!valor?.ruta || vista) return;
      const local = await blobPendiente(valor.ruta);
      if (local) { if (vivo) setVista(URL.createObjectURL(local)); return; }
      const url = await urlFirmada('evidencias', valor.ruta);
      if (vivo && url) setVista(url);
    })();
    return () => { vivo = false; };
  }, [valor?.ruta]);

  async function procesar(file: File | undefined) {
    if (!file) return;
    setAviso('');
    const esPdf = file.type === 'application/pdf';
    if (esPdf && !aceptaPdf) { setAviso('Este campo solo admite fotografías.'); return; }
    if (!esPdf && !file.type.startsWith('image/')) { setAviso('Formato no permitido. Use una fotografía o un PDF.'); return; }
    try {
      setEstado('procesando');
      let blob: Blob = file;
      let mime = file.type;
      const metadatos: Record<string, any> = { nombre_original: file.name, bytes_original: file.size, modificado: new Date(file.lastModified).toISOString() };
      if (!esPdf) {
        const r = await comprimirImagen(file);
        blob = r.blob; mime = 'image/jpeg';
        Object.assign(metadatos, { ancho: r.ancho, alto: r.alto, ancho_original: r.anchoOriginal, alto_original: r.altoOriginal });
        if (Math.max(r.anchoOriginal, r.altoOriginal) < 1000) setAviso('La imagen tiene baja resolución. Verifique que el texto se lea; si no, tome otra foto.');
      }
      if (blob.size > MAX_BYTES) { setEstado('error'); setAviso('El archivo supera 15 MB.'); return; }
      const hash = await sha256(blob);
      const grupo = ctx.encuestaId || ctx.intentoId || 'sin_grupo';
      const ruta = rutaEvidencia(ctx.uid, ctx.viviendaId, grupo, campo, hash, mime);
      const item = { ruta, blob, mime, sha256: hash, campo, viviendaId: ctx.viviendaId, encuestaId: ctx.encuestaId, intentoId: ctx.intentoId, metadatos };
      setVista(URL.createObjectURL(blob));
      if (!navigator.onLine) {
        await encolarArchivo(item);
        onChange({ ruta, sha256: hash, mime, pendiente: true });
        setEstado('');
        return;
      }
      setEstado('subiendo');
      try {
        await subirEvidencia(item);
        onChange({ ruta, sha256: hash, mime });
      } catch {
        await encolarArchivo(item);
        onChange({ ruta, sha256: hash, mime, pendiente: true });
      }
      setEstado('');
    } catch (e: any) {
      setEstado('error');
      setAviso(e?.message || 'No se pudo procesar el archivo.');
    } finally {
      if (camara.current) camara.current.value = '';
      if (galeria.current) galeria.current.value = '';
    }
  }

  const esPdf = valor?.mime === 'application/pdf';
  return (
    <div className="space-y-2">
      {valor?.ruta && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {esPdf ? (
            <a href={vista || '#'} target="_blank" rel="noreferrer" className="block p-4 font-bold">Ver PDF cargado</a>
          ) : vista ? (
            <a href={vista} target="_blank" rel="noreferrer"><img src={vista} alt="Vista previa" className="max-h-72 w-full object-contain" /></a>
          ) : (
            <div className="p-4 text-sm text-slate-500">Cargando vista previa…</div>
          )}
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs">
            <span className={valor.pendiente ? 'font-bold text-sol-oscuro' : 'text-green-800'}>
              {valor.pendiente ? 'Guardado en el teléfono · pendiente de subir' : 'Subido al servidor'}
            </span>
            {!esPdf && <span className="text-slate-500">Toque la imagen para verificar que sea legible</span>}
          </div>
        </div>
      )}
      {aviso && <p className="rounded-lg bg-sol-claro p-2 text-sm text-sol-oscuro">{aviso}</p>}
      {!deshabilitado && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-primario" onClick={() => camara.current?.click()} disabled={!!estado && estado !== 'error'}>
            {estado === 'procesando' ? 'Procesando…' : estado === 'subiendo' ? 'Subiendo…' : valor?.ruta ? 'Tomar otra' : 'Tomar foto'}
          </button>
          <button type="button" className="btn-secundario" onClick={() => galeria.current?.click()} disabled={!!estado && estado !== 'error'}>
            {aceptaPdf ? 'Elegir archivo' : 'Elegir de galería'}
          </button>
          <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => procesar(e.target.files?.[0])} />
          <input ref={galeria} type="file" accept={aceptaPdf ? 'image/*,application/pdf' : 'image/*'} hidden onChange={(e) => procesar(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}
