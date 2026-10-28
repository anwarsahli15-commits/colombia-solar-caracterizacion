import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validarFormato, derivarRuta, evaluar } from '../shared/validacion.mjs';
import { normalizarDireccion, nombreSeguro } from '../shared/normalizar.mjs';

const I = JSON.parse(fs.readFileSync(new URL('../shared/instrumento-f5-v1.json', import.meta.url), 'utf8'));
const base = { mayor_edad: 'SI', acepta_datos: 'SI' };

test('teléfono celular colombiano', () => {
  assert.equal(validarFormato('telefono', '3042157424'), null);
  assert.notEqual(validarFormato('telefono', '4042157424'), null);
  assert.notEqual(validarFormato('telefono', '304215742'), null);
});

test('correo: un @, dominio y terminación; acepta dominios distintos a .com/.co', () => {
  for (const ok of ['a@b.org', 'x@dominio.gov.co', 'x@d.io', 'No tiene']) assert.equal(validarFormato('correo', ok), null, ok);
  for (const mal of ['a@@b.com', 'ab.com', 'a@b', 'a b@c.com']) assert.notEqual(validarFormato('correo', mal), null, mal);
});

test('identificadores numéricos y nombres', () => {
  assert.equal(validarFormato('documento', '72185892'), null);
  assert.notEqual(validarFormato('documento', '72.185.892'), null);
  assert.equal(validarFormato('nombre', "María José O'Neil"), null);
  assert.notEqual(validarFormato('nombre', 'Juan2'), null);
  assert.equal(validarFormato('matricula', '040-628316'), null);
});

test('rutas del formulario', () => {
  assert.equal(derivarRuta({ mayor_edad: 'NO' }), 'reprogramada');
  assert.equal(derivarRuta({ mayor_edad: 'SI', acepta_datos: 'NO' }), 'sin_datos');
  assert.equal(derivarRuta({ ...base, participa: 'NO' }), 'desistimiento');
  assert.equal(derivarRuta({ ...base, participa: 'SI', relacion: 'Arrendatario', autorizacion: 'NO' }), 'reprogramada');
  assert.equal(derivarRuta({ ...base, participa: 'SI', relacion: 'Propietario' }), 'completa');
});

test('sin aceptación de datos no se piden datos personales', () => {
  const e = evaluar(I, { mayor_edad: 'SI', acepta_datos: 'NO' }, {});
  assert.ok(!e.visibles.has('nombres'));
  assert.ok(e.visibles.has('mantiene_no_acepta'));
});

test('desistimiento de no propietario pide datos mínimos del propietario', () => {
  const e = evaluar(I, { ...base, participa: 'NO', relacion: 'Arrendatario' }, {});
  assert.ok(e.visibles.has('prop_nombres') && e.requeridos.has('prop_telefono'));
  assert.ok(!e.requeridos.has('prop_num_id'));
  assert.ok(!e.visibles.has('nic'));
});

test('condicionales y coherencia', () => {
  let e = evaluar(I, { ...base, participa: 'SI', relacion: 'Propietario', discapacidad: 'NO' }, {});
  assert.ok(!e.visibles.has('disc_tipo'));
  e = evaluar(I, { ...base, participa: 'SI', relacion: 'Propietario', personas_medidor: 3, menores_medidor: 2, adultos_mayores_medidor: 2 }, {});
  assert.ok(e.errores.adultos_mayores_medidor);
});

test('consumo alto exige confirmación y no se corrige', () => {
  const r = { ...base, participa: 'SI', relacion: 'Propietario', consumo_promedio: 900 };
  let e = evaluar(I, r, { vivienda: { consumo_muestra: 140 } });
  assert.ok(e.alertasPendientes.includes('consumo_promedio'));
  e = evaluar(I, { ...r, _conf: { consumo_promedio: 900 } }, {});
  assert.ok(!e.alertasPendientes.includes('consumo_promedio'));
  assert.equal(e.respuestasLimpias.consumo_promedio, 900);
});

test('respuestas incompatibles se detectan y se limpian', () => {
  const e = evaluar(I, { ...base, participa: 'NO', relacion: 'Propietario', nic: '123' }, {});
  assert.ok(e.ocultosConValor.includes('nic'));
  assert.ok(!('nic' in e.respuestasLimpias));
});

test('normalización de direcciones', () => {
  assert.equal(normalizarDireccion('CR 11sur Cl 50 C 80'), normalizarDireccion('Carrera 11 Sur Calle 50C-80'));
  assert.equal(normalizarDireccion('Calle 42 No. 3B-33'), normalizarDireccion('CL 42 3B 33'));
  assert.equal(nombreSeguro('CR 15S CL 46 - 64 DPL BA1034'), 'CR_15S_CL_46_-_64_DPL_BA1034');
});

test('estructura del instrumento', () => {
  const campos = I.secciones.flatMap((s) => s.campos);
  const ids = campos.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const cols = I.exportacion.map((c) => c.col);
  assert.equal(new Set(cols).size, cols.length, 'columnas únicas');
  for (const c of I.exportacion) if (c.src.startsWith('r.')) assert.ok(ids.includes(c.src.slice(2)), c.src);
});
