// Trabajador de exportación. Se ejecuta en GitHub Actions (ver .github/workflows/exportar-paquetes.yml).
// Toma un paquete en cola, genera Excel, CSV, PDF por vivienda, shapefile y ZIP por volúmenes,
// verifica el resultado y lo guarda en el bucket privado «exportaciones».
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import proj4 from 'proj4';
import { evaluar, campoPorId, esArchivo, ETIQUETA_RUTA } from '../shared/validacion.mjs';
import { cumple } from '../shared/condiciones.mjs';
import { nombreSeguro } from '../shared/normalizar.mjs';
import { escribirShapefile } from './shapefile.mjs';
import { generarInstrumentoPdf } from './pdf.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const instrumento = JSON.parse(fs.readFileSync(path.join(DIR, '../shared/instrumento-f5-v1.json'), 'utf8'));
const DEFS = campoPorId(instrumento);
const PLANTILLA = 'EXPORT-F5-V1';
const LIMITE_VOLUMEN = 44 * 1024 * 1024; // < 50 MB por archivo del plan Free de Supabase
const TAMANO = 500;

export const EPSG_9377 = '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
proj4.defs('EPSG:9377', EPSG_9377);
export const aCtm12 = (lon, lat) => proj4('EPSG:4326', 'EPSG:9377', [lon, lat]);

function entorno() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY, ref = process.env.SUPABASE_PROJECT_REF;
  if (!url || !key || !ref) throw new Error('Faltan SUPABASE_URL, SUPABASE_SECRET_KEY o SUPABASE_PROJECT_REF.');
  if (new URL(url).hostname !== `${ref}.supabase.co`) throw new Error('SUPABASE_URL no corresponde a SUPABASE_PROJECT_REF. Operación detenida.');
  return createClient(url, key, { auth: { persistSession: false } });
}

const trozos = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fechaBog = (iso, conHora = false) => {
  if (!iso) return '';
  const d = new Date(iso);
  const o = { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', ...(conHora ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) };
  return d.toLocaleString('es-CO', o).replace(',', '');
};
const compacta = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).replace(/-/g, '');
const NUM_VISITA = ['Primera Visita', 'Segunda Visita', 'Tercera Visita'];

async function seleccionar(sb, tabla, columnas, campo, ids) {
  const out = [];
  for (const t of trozos(ids, 100)) {
    const { data, error } = await sb.from(tabla).select(columnas).in(campo, t);
    if (error) throw new Error(`Lectura de ${tabla}: ${error.message}`);
    out.push(...data);
  }
  return out;
}

async function descargar(sb, ruta) {
  const { data, error } = await sb.storage.from('evidencias').download(ruta);
  if (error) throw new Error(`No se pudo descargar ${ruta}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

function valorExport(c, r, ev) {
  const v = r[c.id];
  const seccionVisible = ev.seccionesVisibles.has(c.seccion);
  if (!ev.visibles.has(c.id)) {
    if (seccionVisible && c.na) return 'No aplica';
    if (seccionVisible && c.na0) return 0;
    return '';
  }
  if (v === undefined || v === null || v === '') return '';
  if (esArchivo(c)) return v.ruta ? 'Evidencia anexada' : '';
  if (c.tipo === 'check') return v === true ? 'SI' : 'NO';
  if (c.tipo === 'multi') return v.join('; ');
  if (c.tipo === 'fecha') return v.split('-').reverse().join('/');
  return v;
}

export async function procesarPaquete(sb, p) {
  const nombre = `Paquete_${String(p.numero).padStart(3, '0')}`;
  const tmp = path.join(DIR, 'tmp', p.id);
  const raiz = path.join(tmp, nombre);
  await fsp.rm(tmp, { recursive: true, force: true });
  await fsp.mkdir(raiz, { recursive: true });
  const errores = [];

  const { data: filas, error } = await sb.from('paquete_vivienda').select('vivienda_id, encuesta_id').eq('paquete_id', p.id);
  if (error) throw error;
  const idsV = filas.map((f) => f.vivienda_id);
  if (filas.length !== TAMANO || new Set(idsV).size !== TAMANO) throw new Error(`El paquete tiene ${filas.length} filas y ${new Set(idsV).size} viviendas únicas; se exigen ${TAMANO}.`);

  const [viviendas, encuestas, intentos, evidencias, perfiles, cfg] = await Promise.all([
    seleccionar(sb, 'vivienda', 'id, niu, direccion, estrato_muestra, barrio:barrio_id(nombre)', 'id', idsV),
    seleccionar(sb, 'encuesta', '*', 'id', filas.map((f) => f.encuesta_id)),
    seleccionar(sb, 'intento_visita', '*', 'vivienda_id', idsV),
    seleccionar(sb, 'evidencia', 'ruta, campo, mime, sha256, encuesta_id', 'encuesta_id', filas.map((f) => f.encuesta_id)),
    sb.from('perfil').select('id, nombre').then((r) => r.data || []),
    sb.from('config').select('clave, valor').then((r) => Object.fromEntries((r.data || []).map((c) => [c.clave, c.valor]))),
  ]);
  const nombreDe = Object.fromEntries(perfiles.map((x) => [x.id, x.nombre]));
  const vMap = Object.fromEntries(viviendas.map((v) => [v.id, v]));
  const eMap = Object.fromEntries(encuestas.map((e) => [e.id, e]));
  const evPorRuta = Object.fromEntries(evidencias.map((e) => [e.ruta, e]));

  const registros = filas.map((f) => {
    const v = vMap[f.vivienda_id], e = eMap[f.encuesta_id];
    const ints = intentos.filter((i) => i.vivienda_id === v.id).sort((a, b) => a.numero - b.numero);
    const it = ints.find((i) => i.id === e.intento_id);
    if (e.estado !== 'aprobada' || !e.vigente) errores.push(`NIU ${v.niu}: la encuesta no está aprobada y vigente.`);
    if (!it || it.lat == null || (it.precision_m > 4 && it.gps_excepcion !== 'aprobada')) errores.push(`NIU ${v.niu}: georreferenciación incompleta.`);
    return { v, e, ints, it, barrio: v.barrio?.nombre || 'SIN_BARRIO' };
  }).sort((a, b) => (a.barrio + a.v.direccion).localeCompare(b.barrio + b.v.direccion, 'es'));

  // Carpetas: barrio / dirección oficial saneada, con NIU si dos direcciones coinciden.
  const usados = new Set();
  for (const r of registros) {
    const b = nombreSeguro(r.barrio, 60);
    let d = nombreSeguro(r.v.direccion, 90);
    if (usados.has(`${b}/${d}`)) d = `${d}_${nombreSeguro(r.v.niu, 30)}`;
    usados.add(`${b}/${d}`);
    r.carpeta = `${b}/${d}`;
    if (r.it?.lat != null) [r.x, r.y] = aCtm12(r.it.lon, r.it.lat);
  }

  const contrato = cfg.contrato || {}, ubic = cfg.ubicacion || {};
  const shapefileNombre = `${nombre}_MAGNA_SIRGAS_CTM12`;
  const archivosViv = new Map();
  const filasExcel = [];

  for (const r of registros) {
    const { v, e, ints, it } = r;
    const resp = e.respuestas || {};
    const ev = evaluar(instrumento, resp, { config: cfg, vivienda: v });
    if (Object.keys(ev.errores).length) errores.push(`NIU ${v.niu}: ${Object.keys(ev.errores).length} campos no cumplen las reglas (${Object.keys(ev.errores).slice(0, 4).join(', ')}).`);
    const fecha = compacta(e.enviada_en || it?.inicio || e.creado);
    const dirV = path.join(raiz, r.carpeta);
    const lista = [];
    const escribir = async (rel, buf) => {
      const abs = path.join(dirV, rel);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, buf);
      lista.push({ rel: `${r.carpeta}/${rel}`.replace(/\\/g, '/'), abs, bytes: buf.length, sha256: sha(buf) });
    };

    const imagenes = {};
    for (const c of Object.values(DEFS)) {
      if (!esArchivo(c) || !ev.visibles.has(c.id)) continue;
      const val = resp[c.id];
      if (!val?.ruta) { if (ev.requeridos.has(c.id)) errores.push(`NIU ${v.niu}: falta la evidencia «${c.etiqueta}».`); continue; }
      const reg = evPorRuta[val.ruta];
      if (!reg) { errores.push(`NIU ${v.niu}: la evidencia «${c.etiqueta}» no está registrada.`); continue; }
      const buf = await descargar(sb, val.ruta);
      if (sha(buf) !== reg.sha256) errores.push(`NIU ${v.niu}: la evidencia «${c.etiqueta}» no coincide con su huella SHA-256.`);
      const ext = reg.mime === 'application/pdf' ? 'pdf' : reg.mime === 'image/png' ? 'png' : 'jpg';
      await escribir(`${c.carpeta || 'Evidencias'}/${nombreSeguro(v.niu, 30)}_${c.archivo}_${fecha}.${ext}`, buf);
      if (ext !== 'pdf') imagenes[c.id] = { bytes: buf, tipo: ext };
    }

    const lineasHist = [['Numero', 'Fecha y hora', 'Resultado', 'Encuestador', 'Latitud WGS84', 'Longitud WGS84', 'Precision (m)', 'Excepcion GPS']];
    for (const i of ints) {
      const carpeta = `Historial_Visitas/Visita_${String(i.numero).padStart(2, '0')}`;
      if (i.foto_fachada) {
        const buf = await descargar(sb, i.foto_fachada);
        await escribir(`${carpeta}/${nombreSeguro(v.niu, 30)}_FachadaVisita${i.numero}_${compacta(i.inicio)}.jpg`, buf);
      }
      const fila = [i.numero, fechaBog(i.inicio, true), i.resultado === 'atendida' ? 'Atendida' : i.resultado === 'cerrada' ? 'Sin atencion' : 'Sin resultado',
        nombreDe[i.encuestador_id] || '', i.lat ?? '', i.lon ?? '', i.precision_m ?? '', i.gps_excepcion || ''];
      lineasHist.push(fila);
      await escribir(`${carpeta}/visita.csv`, Buffer.from('\uFEFF' + [lineasHist[0], fila].map((l) => l.join(';')).join('\r\n'), 'utf8'));
    }

    await escribir(`Georreferenciacion/${nombreSeguro(v.niu, 30)}_coordenadas.csv`, Buffer.from('\uFEFF' + [
      ['NIU', 'Latitud WGS84', 'Longitud WGS84', 'Precision (m)', 'Fecha captura', 'X MAGNA-SIRGAS Origen Nacional (EPSG:9377)', 'Y MAGNA-SIRGAS Origen Nacional (EPSG:9377)', 'Dispositivo'],
      [v.niu, it?.lat ?? '', it?.lon ?? '', it?.precision_m ?? '', fechaBog(it?.gps_hora, true), r.x?.toFixed(3) ?? '', r.y?.toFixed(3) ?? '', (it?.gps_dispositivo || '').replace(/;/g, ',')],
    ].map((l) => l.join(';')).join('\r\n'), 'utf8'));

    const auto = {
      barrio: r.barrio, contrato_objeto: contrato.objeto, contratante: contrato.contratante, contratista: contrato.contratista, plazo: contrato.plazo,
      fecha_hora: it ? new Date(it.inicio) : '', codigo_registro: e.codigo_registro, departamento: ubic.departamento, municipio: ubic.municipio,
      direccion_oficial: v.direccion, lat: it?.lat ?? '', lon: it?.lon ?? '', precision: it?.precision_m ?? '',
      x_ctm12: r.x != null ? Math.round(r.x * 1000) / 1000 : '', y_ctm12: r.y != null ? Math.round(r.y * 1000) / 1000 : '',
      shapefile: `${shapefileNombre}.shp`, numero_visita: it ? (NUM_VISITA[it.numero - 1] || `Visita ${it.numero}`) : '',
      intentos_sin_atencion: ints.filter((i) => i.resultado === 'cerrada').length,
      fechas_intentos: ints.map((i) => `${i.numero}: ${fechaBog(i.inicio, true)} (${i.resultado === 'atendida' ? 'atendida' : 'sin atención'})`).join('; '),
      resultado: ETIQUETA_RUTA[e.ruta] || e.ruta,
      fecha_nueva_visita: (resp.fecha_nueva_visita || resp.fecha_nueva_visita_menor || '').split('-').reverse().join('/') || (ev.visibles.has('autorizacion') ? 'No aplica' : ''),
      niu: v.niu, encuestador: nombreDe[e.encuestador_id] || '', rol_encuestador: 'Encuestador',
      validado_supervisor: e.validada_por ? 'SI' : 'NO', aprobado_coordinador: e.aprobada_por ? 'SI' : 'NO',
    };
    const fila = instrumento.exportacion.map((col) => {
      const [tipo, id] = col.src.split('.');
      return tipo === 'auto' ? (auto[id] ?? '') : valorExport(DEFS[id], resp, ev);
    });
    filasExcel.push(fila);
    r.ev = ev;

    const secciones = instrumento.secciones.filter((s) => ev.seccionesVisibles.has(s.id)).map((s) => ({
      titulo: s.titulo,
      filas: s.campos.filter((c) => ev.visibles.has(c.id) && !c.tipo.startsWith('aviso')).map((c) => ({
        etiqueta: c.etiqueta,
        valor: esArchivo(c) ? (resp[c.id]?.ruta ? (resp[c.id].mime === 'application/pdf' ? 'Documento PDF anexado en la carpeta Evidencias' : '') : 'Sin evidencia') : String(valorExport({ ...c, seccion: s.id }, resp, ev) || '—'),
        imagen: imagenes[c.id],
      })),
    }));
    secciones.push({
      titulo: 'Georreferenciación',
      filas: [
        { etiqueta: 'Latitud / longitud (WGS84, GPS del dispositivo)', valor: it ? `${it.lat}, ${it.lon}` : '—' },
        { etiqueta: 'Precisión horizontal reportada', valor: it?.precision_m != null ? `${it.precision_m} m${it.gps_excepcion === 'aprobada' ? ' (excepción aprobada)' : ''}` : '—' },
        { etiqueta: 'X, Y MAGNA-SIRGAS Origen Nacional (EPSG:9377)', valor: r.x != null ? `${r.x.toFixed(3)}, ${r.y.toFixed(3)}` : '—' },
        { etiqueta: 'Archivo shapefile', valor: `${shapefileNombre}.shp` },
      ],
    });
    secciones.push({
      titulo: 'Historial de visitas',
      filas: ints.map((i) => ({ etiqueta: `Visita ${i.numero}`, valor: `${fechaBog(i.inicio, true)} · ${i.resultado === 'atendida' ? 'Atendida' : 'Sin atención'} · ${nombreDe[i.encuestador_id] || ''} · precisión ${i.precision_m ?? '—'} m` })),
    });
    secciones.push({
      titulo: 'Control de calidad',
      filas: [
        { etiqueta: 'Registro validado por supervisor', valor: `${e.validada_por ? 'Sí' : 'No'} · ${nombreDe[e.validada_por] || ''} · ${fechaBog(e.validada_en, true)}` },
        { etiqueta: 'Registro aprobado por coordinador', valor: `${e.aprobada_por ? 'Sí' : 'No'} · ${nombreDe[e.aprobada_por] || ''} · ${fechaBog(e.aprobada_en, true)}` },
      ],
    });
    const pdf = await generarInstrumentoPdf({
      titulo: instrumento.titulo,
      subtitulo: 'Usuarios soluciones individuales – Programa Colombia Solar',
      cabecera: [
        ['N.º y objeto del contrato', contrato.objeto], ['Contratante', contrato.contratante], ['Contratista', contrato.contratista],
        ['Plazo de ejecución', contrato.plazo], ['Fecha y hora de visita', fechaBog(it?.inicio, true)], ['Código único de registro', e.codigo_registro],
        ['Departamento / municipio', `${ubic.departamento || ''} / ${ubic.municipio || ''}`], ['Barrio', r.barrio],
        ['Dirección oficial (muestra)', v.direccion], ['NIU', v.niu], ['Resultado de la visita', ETIQUETA_RUTA[e.ruta]],
      ],
      secciones,
      pie: `${nombre} · NIU ${v.niu} · ${e.codigo_registro}`,
    });
    await escribir(`Instrumento_Caracterizacion_${nombreSeguro(v.niu, 30)}.pdf`, pdf);
    archivosViv.set(r, lista);
  }

  // ── Base de datos ──
  const raizLista = [];
  const escribirRaiz = async (rel, buf) => {
    const abs = path.join(raiz, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, buf);
    raizLista.push({ rel, abs, bytes: buf.length, sha256: sha(buf) });
    return abs;
  };
  const columnas = instrumento.exportacion.map((c) => c.col);
  const textoCols = new Set(['auto.niu', 'r.nic', 'r.num_id', 'r.telefono', 'r.prop_num_id', 'r.prop_telefono', 'r.ocup_num_id', 'r.ocup_telefono', 'r.jefe_num_id', 'r.ruv_numero', 'r.matricula', 'auto.codigo_registro']);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Plataforma de caracterización Colombia Solar';
  const ws = wb.addWorksheet('Caracterizaciones', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = instrumento.exportacion.map((c) => ({
    header: c.col, width: Math.min(45, Math.max(14, c.col.length * 0.6)),
    style: textoCols.has(c.src) ? { numFmt: '@' } : c.src === 'auto.fecha_hora' ? { numFmt: 'dd/mm/yyyy hh:mm' } : {},
  }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: 'top' };
  instrumento.exportacion.forEach((c, j) => {
    if (textoCols.has(c.src)) filasExcel.forEach((f) => { if (f[j] !== '' && f[j] != null) f[j] = String(f[j]); });
  });
  filasExcel.forEach((f) => ws.addRow(f));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());
  await escribirRaiz(`Base_de_datos/${nombre}.xlsx`, xlsxBuf);
  const csvCelda = (x) => { const s = x instanceof Date ? fechaBog(x.toISOString(), true) : String(x ?? ''); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  await escribirRaiz(`Base_de_datos/${nombre}.csv`, Buffer.from('\uFEFF' + [columnas, ...filasExcel].map((l) => l.map(csvCelda).join(';')).join('\r\n'), 'utf8'));

  const dic = new ExcelJS.Workbook();
  const wd = dic.addWorksheet('Diccionario');
  wd.columns = [{ header: 'Columna', width: 60 }, { header: 'Origen', width: 14 }, { header: 'Pregunta en el aplicativo', width: 60 }, { header: 'Sección', width: 30 }, { header: 'Tipo', width: 12 }, { header: 'Opciones', width: 60 }];
  wd.getRow(1).font = { bold: true };
  for (const c of instrumento.exportacion) {
    const [t, id] = c.src.split('.');
    const d = DEFS[id];
    wd.addRow([c.col, t === 'auto' ? 'Automático' : 'Respuesta', d?.etiqueta || id, d ? instrumento.secciones.find((s) => s.id === d.seccion)?.titulo : '', d?.tipo || '', (d?.opciones || []).join(' | ')]);
  }
  await escribirRaiz('Base_de_datos/Diccionario_campos.xlsx', Buffer.from(await dic.xlsx.writeBuffer()));

  // ── Shapefile ──
  const puntos = registros.filter((r) => r.x != null).map((r) => {
    const resp = r.e.respuestas || {};
    const riesgos = ['riesgo_conflictos', 'riesgo_disputas', 'riesgo_desconfianza', 'riesgo_orden_publico', 'riesgo_resistencia', 'riesgo_vulnerabilidad']
      .filter((k) => resp[k] === 'SI').map((k) => DEFS[k].etiqueta).join('; ');
    const nombreU = [resp.nombres, resp.apellidos].filter(Boolean).join(' ');
    return {
      x: r.x, y: r.y,
      atributos: {
        NIU: r.v.niu, NIC: resp.nic || '', NOMBRE: nombreU, DIRECCION: r.v.direccion, BARRIO: r.barrio,
        ESTRATO: resp.estrato || '', ETNICO: resp.etnico === 'SI' ? (resp.etnico_cual || 'SI') : resp.etnico || '',
        DISCAPAC: resp.discapacidad === 'SI' ? (resp.disc_tipo || []).join('; ') || 'SI' : resp.discapacidad || '',
        PERSONAS: resp.personas_medidor ?? '', MENORES: resp.menores_medidor ?? '', ADULT_MAY: resp.adultos_mayores_medidor ?? '',
        ACT_PROD: resp.act_productivas || '', RIESGO_SOC: riesgos || (resp.riesgos === 'NO' ? 'Ninguno' : ''),
        RESULTADO: ETIQUETA_RUTA[r.e.ruta] || '', FECHA: fechaBog(r.it?.inicio, true), PRECISION: r.it?.precision_m ?? '',
        LAT_WGS84: r.it.lat, LON_WGS84: r.it.lon, X_CTM12: r.x, Y_CTM12: r.y,
      },
    };
  });
  const shp = escribirShapefile(puntos, [
    { nombre: 'NIU', tipo: 'C', largo: 20 }, { nombre: 'NIC', tipo: 'C', largo: 20 }, { nombre: 'NOMBRE', tipo: 'C', largo: 100 },
    { nombre: 'DIRECCION', tipo: 'C', largo: 120 }, { nombre: 'BARRIO', tipo: 'C', largo: 60 }, { nombre: 'ESTRATO', tipo: 'C', largo: 2 },
    { nombre: 'ETNICO', tipo: 'C', largo: 80 }, { nombre: 'DISCAPAC', tipo: 'C', largo: 120 }, { nombre: 'PERSONAS', tipo: 'N', largo: 4 },
    { nombre: 'MENORES', tipo: 'N', largo: 4 }, { nombre: 'ADULT_MAY', tipo: 'N', largo: 4 }, { nombre: 'ACT_PROD', tipo: 'C', largo: 150 },
    { nombre: 'RIESGO_SOC', tipo: 'C', largo: 254 }, { nombre: 'RESULTADO', tipo: 'C', largo: 50 }, { nombre: 'FECHA', tipo: 'C', largo: 20 },
    { nombre: 'PRECISION', tipo: 'N', largo: 8, decimales: 2 }, { nombre: 'LAT_WGS84', tipo: 'N', largo: 14, decimales: 8 },
    { nombre: 'LON_WGS84', tipo: 'N', largo: 14, decimales: 8 }, { nombre: 'X_CTM12', tipo: 'N', largo: 15, decimales: 3 },
    { nombre: 'Y_CTM12', tipo: 'N', largo: 15, decimales: 3 },
  ]);
  for (const ext of ['shp', 'shx', 'dbf', 'prj', 'cpg']) await escribirRaiz(`Georreferenciacion/${shapefileNombre}.${ext}`, shp[ext]);
  await escribirRaiz('Georreferenciacion/Metodo_transformacion.txt', Buffer.from([
    'MÉTODO DE CAPTURA Y TRANSFORMACIÓN GEODÉSICA',
    '',
    'Captura: GPS del teléfono móvil mediante la API de geolocalización del navegador (enableHighAccuracy).',
    'Se toman lecturas durante hasta 45 s frente a la puerta principal y se conserva la de menor error horizontal.',
    'Sistema de captura: WGS84 (EPSG:4326), coordenadas geográficas en grados decimales.',
    'Precisión exigida: <= 4 m (términos de referencia). Las excepciones aprobadas por el coordinador se identifican en la columna «Precisión» y en el historial.',
    'El dispositivo y navegador de cada captura se registran en Georreferenciacion/<NIU>_coordenadas.csv.',
    '',
    'Transformación 1: WGS84 -> MAGNA-SIRGAS geográficas (EPSG:4686). Transformación nula (parámetros 0,0,0,0,0,0,0),',
    'según la equivalencia práctica adoptada por el IGAC entre WGS84 y MAGNA-SIRGAS (diferencia inferior al metro).',
    'Transformación 2: MAGNA-SIRGAS geográficas -> MAGNA-SIRGAS Origen Nacional (EPSG:9377), proyección Transversa de Mercator:',
    '  latitud de origen 4° N, meridiano central 73° W, factor de escala 0,9992, falso este 5 000 000 m, falso norte 2 000 000 m, elipsoide GRS80.',
    `Herramienta: proj4js (${EPSG_9377}).`,
    '',
    'Atributos no incluidos en este shapefile: espacio disponible para instalación, estado de la cubierta y concepto técnico',
    'de viabilidad preliminar. Corresponden al Formato 6 (caracterización técnica), que no forma parte de este aplicativo.',
  ].join('\r\n'), 'utf8'));

  // ── Verificación antes de empaquetar ──
  const nius = registros.map((r) => r.v.niu);
  if (filasExcel.length !== TAMANO) errores.push(`El Excel tiene ${filasExcel.length} filas.`);
  if (new Set(nius).size !== TAMANO) errores.push('Hay NIU repetidos en el paquete.');
  if (puntos.length !== TAMANO) errores.push(`El shapefile tiene ${puntos.length} puntos de ${TAMANO}.`);
  const colNiu = instrumento.exportacion.findIndex((c) => c.src === 'auto.niu');
  if (filasExcel.some((f, i) => f[colNiu] !== registros[i].v.niu)) errores.push('El NIU del Excel no coincide con la base de datos.');
  if (errores.length) throw new Error('Verificación fallida:\n' + errores.slice(0, 50).join('\n'));

  // ── Volúmenes ZIP ──
  const volumenes = [{ entradas: [...raizLista], tamano: raizLista.reduce((s, x) => s + x.bytes, 0), viviendas: [] }];
  for (const r of registros) {
    const lista = archivosViv.get(r);
    const t = lista.reduce((s, x) => s + x.bytes, 0);
    let vol = volumenes[volumenes.length - 1];
    if (vol.tamano + t > LIMITE_VOLUMEN && (vol.viviendas.length || vol.entradas.length)) {
      vol = { entradas: [], tamano: 0, viviendas: [] };
      volumenes.push(vol);
    }
    vol.entradas.push(...lista); vol.tamano += t; vol.viviendas.push(r);
  }
  const nombreVol = (i) => volumenes.length === 1 ? `${nombre}.zip` : `${nombre}_parte${String(i + 1).padStart(2, '0')}.zip`;

  const man = new ExcelJS.Workbook();
  const wm = man.addWorksheet('Manifiesto');
  wm.columns = [{ header: 'Archivo ZIP', width: 26 }, { header: 'NIU', width: 18 }, { header: 'Barrio', width: 28 }, { header: 'Dirección oficial', width: 40 },
    { header: 'Ruta dentro del paquete', width: 90 }, { header: 'Bytes', width: 12 }, { header: 'SHA-256', width: 70 }];
  wm.getRow(1).font = { bold: true };
  volumenes.forEach((vol, i) => {
    for (const x of vol.entradas) {
      const r = vol.viviendas.find((rr) => x.rel.startsWith(rr.carpeta + '/'));
      wm.addRow([nombreVol(i), r?.v.niu || '', r?.barrio || '', r?.v.direccion || '', `${nombre}/${x.rel}`, x.bytes, x.sha256]);
    }
  });
  const manAbs = path.join(raiz, 'Manifiesto_Paquete.xlsx');
  const manBuf = Buffer.from(await man.xlsx.writeBuffer());
  await fsp.writeFile(manAbs, manBuf);
  volumenes[0].entradas.push({ rel: 'Manifiesto_Paquete.xlsx', abs: manAbs, bytes: manBuf.length });

  const salida = [];
  for (let i = 0; i < volumenes.length; i++) {
    const destino = path.join(tmp, nombreVol(i));
    await new Promise((res, rej) => {
      const out = fs.createWriteStream(destino);
      const zip = archiver('zip', { zlib: { level: 6 } });
      out.on('close', res);
      zip.on('error', rej);
      zip.pipe(out);
      for (const x of volumenes[i].entradas) zip.file(x.abs, { name: `${nombre}/${x.rel}`, store: /\.(jpg|png|pdf|zip)$/i.test(x.rel) });
      zip.finalize();
    });
    const buf = await fsp.readFile(destino);
    if (buf.length > 50 * 1024 * 1024) throw new Error(`${nombreVol(i)} supera 50 MB.`);
    salida.push({ nombre: nombreVol(i), buf, tipo: 'application/zip' });
  }
  salida.unshift({ nombre: `${nombre}.xlsx`, buf: xlsxBuf, tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const archivos = [];
  for (const s of salida) {
    const ruta = `${p.id}/${s.nombre}`;
    const { error } = await sb.storage.from('exportaciones').upload(ruta, s.buf, { contentType: s.tipo, upsert: true });
    if (error) throw new Error(`No se pudo guardar ${s.nombre}: ${error.message}`);
    archivos.push({ nombre: s.nombre, ruta, bytes: s.buf.length, sha256: sha(s.buf) });
  }
  // Comprobación de persistencia: cada archivo debe poder leerse de vuelta con la misma huella.
  for (const a of archivos) {
    const { data, error } = await sb.storage.from('exportaciones').download(a.ruta);
    if (error) throw new Error(`No se pudo verificar ${a.nombre}: ${error.message}`);
    if (sha(Buffer.from(await data.arrayBuffer())) !== a.sha256) throw new Error(`${a.nombre} no coincide al releerlo.`);
  }
  await fsp.rm(tmp, { recursive: true, force: true });
  return {
    archivos,
    verificacion: {
      resumen: `${TAMANO} viviendas únicas, ${filasExcel.length} filas en Excel, ${puntos.length} puntos en shapefile, ${volumenes.length} volumen(es) ZIP, huellas SHA-256 verificadas.`,
      viviendas: TAMANO, filas_excel: filasExcel.length, puntos: puntos.length, volumenes: volumenes.length, plantilla: PLANTILLA,
    },
  };
}

async function main() {
  const sb = entorno();
  for (;;) {
    const { data: p, error } = await sb.rpc('reclamar_paquete');
    if (error) throw new Error('reclamar_paquete: ' + error.message);
    if (!p) { console.log('No hay paquetes en cola.'); return; }
    console.log(`Generando paquete ${p.id} (N.º ${p.numero})…`);
    try {
      const r = await procesarPaquete(sb, p);
      const { error: e2 } = await sb.rpc('finalizar_paquete', { p_paquete: p.id, p_ok: true, p_archivos: r.archivos, p_verificacion: r.verificacion, p_error: null });
      if (e2) throw new Error('finalizar_paquete: ' + e2.message);
      console.log(r.verificacion.resumen);
    } catch (e) {
      console.error(e);
      // No deja archivos parciales: las viviendas no se marcan como exportadas.
      const { data: restos } = await sb.storage.from('exportaciones').list(p.id);
      if (restos?.length) await sb.storage.from('exportaciones').remove(restos.map((x) => `${p.id}/${x.name}`));
      await sb.rpc('finalizar_paquete', { p_paquete: p.id, p_ok: false, p_archivos: [], p_verificacion: {}, p_error: String(e?.message || e) });
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
