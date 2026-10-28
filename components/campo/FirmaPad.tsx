'use client';
import { useEffect, useRef, useState } from 'react';
import { rutaEvidencia, sha256, subirEvidencia, urlFirmada } from '@/lib/subir';
import { encolarArchivo, blobPendiente } from '@/lib/offline';
import type { ContextoArchivo, ValorArchivo } from './FotoEvidencia';

// Firma manuscrita en pantalla. Se guarda como imagen PNG con metadatos de captura;
// no constituye una firma electrónica certificada.
export default function FirmaPad({ campo, valor, onChange, ctx, deshabilitado }: {
  campo: string;
  valor: ValorArchivo;
  onChange: (v: ValorArchivo) => void;
  ctx: ContextoArchivo;
  deshabilitado?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [editando, setEditando] = useState(!valor?.ruta);
  const [trazos, setTrazos] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const dibujando = useRef(false);

  useEffect(() => {
    (async () => {
      if (!valor?.ruta) return;
      const local = await blobPendiente(valor.ruta);
      setVista(local ? URL.createObjectURL(local) : await urlFirmada('evidencias', valor.ruta));
    })();
  }, [valor?.ruta]);

  useEffect(() => {
    if (!editando || !canvas.current) return;
    const c = canvas.current;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    const ctx2 = c.getContext('2d')!;
    ctx2.scale(dpr, dpr);
    ctx2.fillStyle = '#ffffff';
    ctx2.fillRect(0, 0, r.width, r.height);
    ctx2.lineWidth = 2.4;
    ctx2.lineCap = 'round';
    ctx2.lineJoin = 'round';
    ctx2.strokeStyle = '#111827';
    setTrazos(0);
  }, [editando]);

  function punto(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function abajo(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const p = punto(e);
    const c = canvas.current!.getContext('2d')!;
    c.beginPath();
    c.moveTo(p.x, p.y);
  }
  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const p = punto(e);
    const c = canvas.current!.getContext('2d')!;
    c.lineTo(p.x, p.y);
    c.stroke();
  }
  function arriba() {
    if (dibujando.current) setTrazos((n) => n + 1);
    dibujando.current = false;
  }

  async function guardar() {
    setGuardando(true);
    const blob: Blob = await new Promise((res) => canvas.current!.toBlob((b) => res(b!), 'image/png'));
    const hash = await sha256(blob);
    const grupo = ctx.encuestaId || ctx.intentoId || 'sin_grupo';
    const ruta = rutaEvidencia(ctx.uid, ctx.viviendaId, grupo, campo, hash, 'image/png');
    const item = {
      ruta, blob, mime: 'image/png', sha256: hash, campo, viviendaId: ctx.viviendaId,
      encuestaId: ctx.encuestaId, intentoId: ctx.intentoId,
      metadatos: { tipo: 'firma_en_pantalla', capturada: new Date().toISOString(), trazos, navegador: navigator.userAgent },
    };
    setVista(URL.createObjectURL(blob));
    try {
      if (!navigator.onLine) throw new Error('sin conexión');
      await subirEvidencia(item);
      onChange({ ruta, sha256: hash, mime: 'image/png' });
    } catch {
      await encolarArchivo(item);
      onChange({ ruta, sha256: hash, mime: 'image/png', pendiente: true });
    }
    setGuardando(false);
    setEditando(false);
  }

  if (!editando && valor?.ruta) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          {vista ? <img src={vista} alt="Firma capturada" className="mx-auto max-h-40" /> : <p className="p-3 text-sm text-slate-500">Cargando firma…</p>}
        </div>
        <p className="text-xs text-slate-500">{valor.pendiente ? 'Guardada en el teléfono · pendiente de subir' : 'Firma guardada'}</p>
        {!deshabilitado && <button type="button" className="btn-secundario w-full" onClick={() => setEditando(true)}>Volver a firmar</button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <canvas ref={canvas} className="h-48 w-full touch-none rounded-lg border-2 border-dashed border-slate-400 bg-white"
        onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerLeave={arriba} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secundario" onClick={() => { setEditando(false); setTimeout(() => setEditando(true)); }}>Borrar</button>
        <button type="button" className="btn-primario" onClick={guardar} disabled={trazos < 1 || guardando || deshabilitado}>
          {guardando ? 'Guardando…' : 'Guardar firma'}
        </button>
      </div>
    </div>
  );
}
