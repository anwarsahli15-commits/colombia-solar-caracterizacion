import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const EXTRA = new Set('–—‘’“”•…€'.split(''));
// Las fuentes estándar de PDF usan WinAnsi: se reemplazan los caracteres que no puede representar.
export function winAnsi(s) {
  return String(s ?? '')
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/\u00a0/g, ' ').replace(/[\r\t]/g, ' ')
    .split('').map((ch) => (ch.charCodeAt(0) <= 0xff || EXTRA.has(ch) ? ch : '?')).join('');
}

/**
 * doc: { titulo, subtitulo, cabecera: [[k, v]], secciones: [{ titulo, filas: [{ etiqueta, valor, imagen?: { bytes, tipo } }] }], pie }
 */
export async function generarInstrumentoPdf(doc) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(doc.titulo));
  pdf.setProducer('Plataforma de caracterización Colombia Solar');
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const A4 = [595.28, 841.89];
  const M = 42;
  const ancho = A4[0] - 2 * M;
  let page = pdf.addPage(A4);
  let y = A4[1] - M;
  let nPag = 1;

  const pie = () => {
    page.drawText(winAnsi(`${doc.pie} · Página ${nPag}`), { x: M, y: 22, size: 7.5, font: f, color: rgb(0.4, 0.4, 0.4) });
  };
  const nueva = () => { pie(); page = pdf.addPage(A4); nPag++; y = A4[1] - M; };
  const asegurar = (h) => { if (y - h < M + 20) nueva(); };
  const lineas = (texto, fuente, size, max) => {
    const out = [];
    for (const parrafo of winAnsi(texto).split('\n')) {
      let actual = '';
      for (const palabra of parrafo.split(' ')) {
        const prueba = actual ? actual + ' ' + palabra : palabra;
        if (fuente.widthOfTextAtSize(prueba, size) <= max) actual = prueba;
        else {
          if (actual) out.push(actual);
          let p = palabra;
          while (fuente.widthOfTextAtSize(p, size) > max) {
            let k = p.length;
            while (k > 1 && fuente.widthOfTextAtSize(p.slice(0, k), size) > max) k--;
            out.push(p.slice(0, k)); p = p.slice(k);
          }
          actual = p;
        }
      }
      out.push(actual);
    }
    return out;
  };
  const texto = (t, { fuente = f, size = 9, color = rgb(0.1, 0.12, 0.15), x = M, max = ancho, interlinea = 1.3 } = {}) => {
    for (const l of lineas(t, fuente, size, max)) {
      asegurar(size * interlinea);
      page.drawText(l, { x, y: y - size, size, font: fuente, color });
      y -= size * interlinea;
    }
  };

  texto('FO-CS-PR-05', { size: 8, color: rgb(0.35, 0.35, 0.35) });
  texto(doc.titulo, { fuente: fb, size: 13 });
  if (doc.subtitulo) texto(doc.subtitulo, { size: 9, color: rgb(0.3, 0.3, 0.3) });
  y -= 6;
  for (const [k, v] of doc.cabecera) {
    const l = lineas(String(v ?? ''), f, 9, ancho - 150);
    asegurar(l.length * 11.7);
    page.drawText(winAnsi(k), { x: M, y: y - 9, size: 9, font: fb });
    l.forEach((li, i) => page.drawText(li, { x: M + 150, y: y - 9 - i * 11.7, size: 9, font: f }));
    y -= l.length * 11.7 + 2;
  }

  for (const s of doc.secciones) {
    y -= 8;
    asegurar(40);
    page.drawRectangle({ x: M, y: y - 16, width: ancho, height: 16, color: rgb(0.043, 0.306, 0.635) });
    page.drawText(winAnsi(s.titulo), { x: M + 6, y: y - 12, size: 10, font: fb, color: rgb(1, 1, 1) });
    y -= 22;
    for (const fila of s.filas) {
      const colEt = 230;
      const et = lineas(fila.etiqueta, fb, 8.5, colEt - 8);
      const va = lineas(String(fila.valor ?? ''), f, 8.5, ancho - colEt);
      let imgH = 0, img = null;
      if (fila.imagen) {
        try {
          img = fila.imagen.tipo === 'png' ? await pdf.embedPng(fila.imagen.bytes) : await pdf.embedJpg(fila.imagen.bytes);
          const esc = Math.min(220 / img.width, 160 / img.height, 1);
          img = { img, w: img.width * esc, h: img.height * esc };
          imgH = img.h + 4;
        } catch { img = null; }
      }
      const h = Math.max(et.length, va.length) * 11 + imgH + 6;
      asegurar(h);
      et.forEach((l, i) => page.drawText(l, { x: M, y: y - 9 - i * 11, size: 8.5, font: fb, color: rgb(0.2, 0.22, 0.26) }));
      va.forEach((l, i) => page.drawText(l, { x: M + colEt, y: y - 9 - i * 11, size: 8.5, font: f }));
      if (img) page.drawImage(img.img, { x: M + colEt, y: y - va.length * 11 - 2 - img.h, width: img.w, height: img.h });
      y -= h;
      page.drawLine({ start: { x: M, y: y + 2 }, end: { x: M + ancho, y: y + 2 }, thickness: 0.4, color: rgb(0.85, 0.87, 0.9) });
    }
  }
  pie();
  return Buffer.from(await pdf.save());
}
