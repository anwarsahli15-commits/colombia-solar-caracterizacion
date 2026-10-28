import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escribirShapefile } from '../worker/shapefile.mjs';

test('shapefile de puntos: tamaños y cabeceras', () => {
  const pts = [
    { x: 4801234.5, y: 2773456.25, atributos: { NIU: '444-1', N: 1.5 } },
    { x: 4802000, y: 2774000, atributos: { NIU: 'Ñandú', N: 2 } },
  ];
  const s = escribirShapefile(pts, [{ nombre: 'NIU', tipo: 'C', largo: 20 }, { nombre: 'N', tipo: 'N', largo: 8, decimales: 2 }]);
  assert.equal(s.shp.length, 100 + 2 * 28);
  assert.equal(s.shp.readInt32BE(0), 9994);
  assert.equal(s.shp.readInt32BE(24) * 2, s.shp.length);
  assert.equal(s.shp.readInt32LE(32), 1);
  assert.equal(s.shp.readDoubleLE(100 + 12), 4801234.5);
  assert.equal(s.shx.length, 100 + 2 * 8);
  assert.equal(s.shx.readInt32BE(100) * 2, 100);
  assert.equal(s.dbf.readUInt32LE(4), 2);
  assert.equal(s.dbf[s.dbf.length - 1], 0x1a);
  assert.match(s.prj.toString(), /Transverse_Mercator/);
});
