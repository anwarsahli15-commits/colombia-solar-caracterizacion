// Escritura de shapefiles de puntos (ESRI Shapefile Technical Description, 1998) sin dependencias.
// Genera .shp, .shx, .dbf, .prj y .cpg.

export const PRJ_MAGNA_ORIGEN_NACIONAL =
  'PROJCS["MAGNA-SIRGAS_Origen-Nacional",GEOGCS["GCS_MAGNA",DATUM["D_MAGNA",SPHEROID["GRS_1980",6378137.0,298.257222101]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",5000000.0],PARAMETER["False_Northing",2000000.0],PARAMETER["Central_Meridian",-73.0],' +
  'PARAMETER["Scale_Factor",0.9992],PARAMETER["Latitude_Of_Origin",4.0],UNIT["Meter",1.0]]';

function cabecera(buf, longitudBytes, bbox) {
  buf.writeInt32BE(9994, 0);
  buf.writeInt32BE(longitudBytes / 2, 24);
  buf.writeInt32LE(1000, 28);
  buf.writeInt32LE(1, 32); // Point
  buf.writeDoubleLE(bbox[0], 36);
  buf.writeDoubleLE(bbox[1], 44);
  buf.writeDoubleLE(bbox[2], 52);
  buf.writeDoubleLE(bbox[3], 60);
}

function truncarUtf8(s, max) {
  let b = Buffer.from(s, 'utf8');
  if (b.length <= max) return b;
  let t = s;
  while (Buffer.byteLength(t, 'utf8') > max) t = t.slice(0, -1);
  return Buffer.from(t, 'utf8');
}

/**
 * puntos: [{ x, y, atributos: { CAMPO: valor } }]
 * campos: [{ nombre (≤10), tipo: 'C' | 'N', largo, decimales }]
 */
export function escribirShapefile(puntos, campos) {
  if (!puntos.length) throw new Error('Shapefile sin puntos');
  for (const c of campos) if (c.nombre.length > 10) throw new Error(`Nombre de campo DBF > 10: ${c.nombre}`);
  const xs = puntos.map((p) => p.x), ys = puntos.map((p) => p.y);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];

  const shp = Buffer.alloc(100 + puntos.length * 28);
  const shx = Buffer.alloc(100 + puntos.length * 8);
  cabecera(shp, shp.length, bbox);
  cabecera(shx, shx.length, bbox);
  puntos.forEach((p, i) => {
    const o = 100 + i * 28;
    shp.writeInt32BE(i + 1, o);
    shp.writeInt32BE(10, o + 4);
    shp.writeInt32LE(1, o + 8);
    shp.writeDoubleLE(p.x, o + 12);
    shp.writeDoubleLE(p.y, o + 20);
    const so = 100 + i * 8;
    shx.writeInt32BE(o / 2, so);
    shx.writeInt32BE(10, so + 4);
  });

  const largoRegistro = 1 + campos.reduce((s, c) => s + c.largo, 0);
  const largoCabecera = 32 + 32 * campos.length + 1;
  const dbf = Buffer.alloc(largoCabecera + largoRegistro * puntos.length + 1, 0x20);
  dbf.fill(0, 0, largoCabecera);
  const hoy = new Date();
  dbf.writeUInt8(0x03, 0);
  dbf.writeUInt8(hoy.getFullYear() - 1900, 1);
  dbf.writeUInt8(hoy.getMonth() + 1, 2);
  dbf.writeUInt8(hoy.getDate(), 3);
  dbf.writeUInt32LE(puntos.length, 4);
  dbf.writeUInt16LE(largoCabecera, 8);
  dbf.writeUInt16LE(largoRegistro, 10);
  dbf.writeUInt8(0x57, 29); // código de página ANSI; el .cpg declara UTF-8
  campos.forEach((c, i) => {
    const o = 32 + i * 32;
    dbf.write(c.nombre, o, 'ascii');
    dbf.write(c.tipo, o + 11, 'ascii');
    dbf.writeUInt8(c.largo, o + 16);
    dbf.writeUInt8(c.decimales || 0, o + 17);
  });
  dbf.writeUInt8(0x0d, largoCabecera - 1);
  puntos.forEach((p, i) => {
    let o = largoCabecera + i * largoRegistro;
    dbf.write(' ', o, 'ascii');
    o += 1;
    for (const c of campos) {
      const v = p.atributos[c.nombre];
      if (c.tipo === 'N') {
        const s = v === null || v === undefined || v === '' || Number.isNaN(Number(v))
          ? '' : Number(v).toFixed(c.decimales || 0);
        if (s.length > c.largo) throw new Error(`Valor numérico demasiado largo en ${c.nombre}: ${s}`);
        dbf.write(s.padStart(c.largo, ' '), o, 'ascii');
      } else {
        truncarUtf8(String(v ?? ''), c.largo).copy(dbf, o);
      }
      o += c.largo;
    }
  });
  dbf.writeUInt8(0x1a, dbf.length - 1);
  return { shp, shx, dbf, prj: Buffer.from(PRJ_MAGNA_ORIGEN_NACIONAL, 'ascii'), cpg: Buffer.from('UTF-8', 'ascii') };
}
