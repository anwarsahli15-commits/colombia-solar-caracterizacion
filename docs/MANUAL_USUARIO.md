# Manual de usuario

## Encuestador

**Antes de salir:** batería cargada, ubicación (GPS) activada, permiso de cámara y ubicación para el sitio, y sesión iniciada. Para instalar la app: menú del navegador → «Agregar a la pantalla de inicio».

1. **Elegir el barrio.** Solo aparecen los barrios asignados. La app recuerda el último.
2. **Buscar la vivienda.** Escriba la dirección o el NIU. Puede escribir «Calle», «CL», «Carrera» o «CR»; las tildes y espacios no importan. Toque la vivienda correcta comparando NIU y estrato. La dirección oficial y el NIU no se pueden editar.
   - Si no aparece: use «Reportar dirección no encontrada». No se pueden crear viviendas nuevas.
3. **Registrar la visita.** Toque «Registrar visita N.º X». La fecha y hora las pone el sistema.
4. **Capturar la ubicación** frente a la puerta principal. Se exige precisión de 4 m o menos. Si después de tres intentos no se logra, use «Solicitar excepción y continuar».
5. **¿Atienden?**
   - **Vivienda cerrada / sin atención:** tome la foto del inmueble y toque «Guardar intento sin atención». La vivienda queda disponible para la siguiente visita (máximo tres).
   - **Sí, atienden:** se abre el formulario.
6. **Formulario.** Avance por secciones con «Siguiente». La barra muestra el progreso y el indicador superior el estado de guardado:
   - «Sincronizado»: está en el servidor.
   - «Guardado en el teléfono · sin sincronizar»: no hay señal; se enviará solo al recuperarla.
   Si cambia una respuesta que hace que otras dejen de aplicar, la app le pedirá confirmar antes de borrarlas.
7. **Rutas según las respuestas:**
   - **Menor de edad:** registre la fecha de nueva visita y envíe.
   - **No acepta el tratamiento de datos:** explique que es requisito para ser beneficiaria. Si mantiene la decisión, marque la casilla, tome la foto de la fachada, firme como encuestador y envíe. No registre nombres ni documentos.
   - **No quiere participar (desistimiento):** datos de quien atiende, si es propietario o no, datos de contacto del propietario si no lo es, firmas.
   - **Participa:** formulario completo.
8. **Enviar.** En «Enviar» aparece la lista de pendientes; toque cada uno para ir al campo. Al enviar, el formulario queda en revisión.
9. **Correcciones.** Si el supervisor devuelve un formulario, aparece en la pantalla inicial con el motivo.

## Supervisor

- **Revisión:** abra cada encuesta pendiente, revise respuestas y evidencias (toque las imágenes para ampliarlas) y elija: registrar observación, devolver para corrección (con motivo) o validar.
- **Viviendas:** filtre por barrio, estado, calidad o encuestador; abra el historial completo de cada vivienda.

## Coordinador

- **Panel:** indicadores por vivienda única, por barrio y por encuestador.
- **Aprobar:** encuestas validadas → «Aprobar para exportar». Si falta el certificado de tradición, se necesita una excepción justificada.
- **Excepciones de GPS:** en *Revisión*, apruebe o rechace con justificación.
- **Visita adicional:** en el detalle de una vivienda con tres intentos sin atención.
- **Gestión de paquetes:** seleccione exactamente 500 viviendas aptas (manualmente o con «Completar hasta 500») y confirme. Las viviendas quedan reservadas; el paquete se genera en segundo plano.
- **Paquetes enviados:** estado, conteos, verificación y descarga del Excel y de cada volumen ZIP. Si una generación falla: «Reintentar» o «Liberar viviendas».
- **Selección muestral:** cargue el CSV, revise la vista previa y los rechazados, y confirme. Las viviendas existentes nunca se sobrescriben.
- **Usuarios y Configuración:** cree cuentas, asigne barrios, desactive usuarios, ajuste umbrales y el texto de tratamiento de datos.

## Contenido de cada paquete

```
Paquete_001/
├── Base_de_datos/        Paquete_001.xlsx · Paquete_001.csv · Diccionario_campos.xlsx
├── Georreferenciacion/   Paquete_001_MAGNA_SIRGAS_CTM12.(shp|shx|dbf|prj|cpg) · Metodo_transformacion.txt
├── <BARRIO>/<DIRECCION_OFICIAL>/
│   ├── Instrumento_Caracterizacion_<NIU>.pdf
│   ├── Evidencias/        <NIU>_<TipoFoto>_<AAAAMMDD>.jpg|pdf
│   ├── Firmas/            <NIU>_Firma…_<AAAAMMDD>.png
│   ├── Georreferenciacion/<NIU>_coordenadas.csv
│   └── Historial_Visitas/Visita_01/ …
└── Manifiesto_Paquete.xlsx   (volumen ZIP, NIU, ruta, bytes y SHA-256 de cada archivo)
```

Si el paquete supera 44 MB se divide en `Paquete_001_parte01.zip`, `…parte02.zip`, etc. Descomprima todas las partes en la misma carpeta; el manifiesto indica en qué parte está cada vivienda.
