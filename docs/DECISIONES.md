# Decisiones y supuestos

## Decididas por GECELCA (27/10/2026)

- **Alcance:** solo el Formato 5 socioeconómico (FO-CS-PR-05). El Formato 6 técnico queda fuera.
- **Excel:** una columna por pregunta del Formato 5 (133 columnas), en el orden del instrumento. Se conservan los encabezados del paquete de Prosperar cuando la pregunta existe allí. Las evidencias se reportan como «Evidencia anexada».
- **Tratamiento de datos:** si la persona no lo acepta, no se registra ningún dato personal. El aplicativo muestra al encuestador el aviso de que la aceptación es requisito para ser beneficiaria; si la persona mantiene el «No», el registro queda como «Atendida: no acepta tratamiento de datos» con solo fecha, hora, GPS, encuestador y foto de fachada.
- **GPS:** precisión obligatoria ≤ 4 m. Sin ella el intento no se cierra; tras tres capturas fallidas el encuestador puede solicitar una excepción que solo el coordinador aprueba.
- **ZIP:** generado en GitHub Actions y guardado en Supabase Storage, dividido en volúmenes de ≤ 44 MB por el límite del plan Free.

## Aplicadas según la propuesta (pendientes de confirmación)

| # | Tema | Implementación | Dónde se cambia |
|---|---|---|---|
| D4 | No propietario sin autorización | Se cierra como «Atendida: reprogramada» con fecha acordada; no consume intento sin atención; no es apta para paquete; permite una nueva visita. | `shared/validacion.mjs` (`derivarRuta`) |
| D6 | Mayor de edad | Pregunta inicial obligatoria; «No» → reprogramar. Se exporta como columna. | `shared/instrumento-f5-v1.json` |
| D7 | Teléfono | Celular (10 dígitos, inicia en 3) o fijo (10 dígitos, inicia en 60). | `validarFormato('telefono')` |
| D8 | Ingresos | Lista de rangos en salarios mínimos (como Prosperar), más «Más de 4». | instrumento |
| D9 | Dirección | Dirección oficial de la muestra, bloqueada, y dirección según factura como campo aparte. | instrumento |
| D10/D11 | Paquete | 500 viviendas únicas efectivas aprobadas. Incluye participantes, desistimientos y «no acepta datos», cada uno identificado en «Resultado de la visita». Las cerradas nunca entran. | `crear_paquete` (SQL) |
| D12 | Listas de opciones | Tomadas del Excel de Prosperar. Grupo étnico se completó con las categorías DANE. | instrumento |
| D13 | Ocupante (§3.5) | Se capturan sus datos y se añaden 8 columnas. | instrumento |
| D14 | Consumo | Alerta si el promedio de 6 meses supera 400 kWh o difiere más del 50 % del valor de la muestra. El encuestador confirma; el valor nunca se corrige. | Configuración |
| D15 | Huella | Firma en pantalla obligatoria; foto de la huella opcional. La firma se guarda como imagen y no se presenta como firma electrónica certificada. | instrumento |
| D16 | Certificado de tradición | Puede quedar «pendiente»; bloquea la aprobación salvo excepción justificada del coordinador. | `revisar_encuesta` (SQL) |

## Supuestos técnicos

- **Respuestas en JSON por encuesta**, ligadas a `instrumento_version`, en lugar de una fila por respuesta. Mantiene la historia de cada versión sin uniones costosas; la auditoría registra cambios por campo.
- **Trabajo sin conexión:** las respuestas se guardan en el teléfono (IndexedDB) en cada cambio y se sincronizan al volver la señal; las fotos y firmas quedan en cola local. Iniciar una visita sí requiere conexión (la fecha y hora las asigna el servidor). Los datos locales no se cifran: el teléfono debe tener bloqueo de pantalla.
- **Transformación geodésica:** WGS84 → MAGNA-SIRGAS con transformación nula y proyección a Origen Nacional (EPSG:9377) con proj4. Método y parámetros en cada paquete (`Georreferenciacion/Metodo_transformacion.txt`).
- **Shapefile:** incluye los atributos del Formato 5. Espacio disponible, estado de cubierta y concepto técnico son del Formato 6 y no se incluyen.
- **Numeración de paquetes:** se asigna al iniciar la generación; si falla, el número se libera.
