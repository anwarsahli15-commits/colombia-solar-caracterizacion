# Pruebas

## Estado

| Prueba | Estado |
|---|---|
| Validaciones, rutas, condicionales, limpieza de dependientes, normalización de direcciones, estructura del instrumento (`tests/validacion.test.mjs`) | **Ejecutadas y aprobadas** (27/10/2026, 27 comprobaciones) |
| Transformación WGS84 → EPSG:9377 (origen → 5 000 000 / 2 000 000; ida y vuelta < 1e-14°) | **Ejecutada y aprobada** |
| Escritor de shapefile (`tests/shapefile.test.mjs`) | Escrita; **no ejecutada** (requiere Node) |
| Compilación Next.js y `tsc` | **No ejecutadas**. La prueba se corre en `.github/workflows/pruebas.yml` al subir el código |
| Migraciones SQL contra el proyecto nuevo | **No ejecutadas** |
| Escenarios 1–24 del documento de requisitos y la prueba integral de 500 viviendas | **No ejecutados**. Requieren el proyecto desplegado |

Nada de lo anterior marcado «no ejecutado» debe considerarse aprobado.

## Escenarios de aceptación (manual en el entorno de pruebas)

Use un proyecto de Supabase de **pruebas** distinto del de producción y datos ficticios con NIU que empiecen por `PRUEBA-`.

1. Importar el CSV oficial → 30.792 filas leídas, 30.792 válidas, 0 rechazadas; advertencia por 3 direcciones repetidas.
2. Importar un CSV con un NIU duplicado → la segunda fila aparece en rechazados.
3. Buscar «CR 15 SUR CL 46» en CIUDADELA 20 DE JULIO → aparece CR 15S CL 46 - 64.
4. En la vivienda, la dirección y el NIU no tienen campo editable; un `update` directo a `vivienda` como encuestador falla (RLS).
5. Teléfono 304215742 → error de 10 dígitos; correo `a@@b.com` → error.
6. Discapacidad = No → no aparece «tipo de discapacidad»; en el Excel sale «No aplica».
7. Formulario completo de participante → estado «Pendiente de revisión».
8. Desistimiento de arrendatario → solo pide datos mínimos y firma.
9. Visita 1 cerrada con foto y GPS → «1.ª visita sin atención».
10. Visita 2 → el historial conserva la visita 1 con su foto.
11. Visita 3 cerrada → «No atendida tras 3 intentos»; el botón de nueva visita desaparece; un `insert` directo falla.
12. Vivienda atendida en la visita 2 → historial con 2 intentos; ya no aparece como pendiente.
13. Foto, firma y GPS → visibles en el detalle del supervisor.
14. Cerrar el navegador a mitad del formulario y volver → respuestas recuperadas.
15. Dos intentos «atendida» en la misma vivienda → el segundo `insert` falla («ya fue atendida»).
16. Con 499 aptas → «Generar paquete» deshabilitado; `crear_paquete` con 499 falla.
17. Con 500 aptas → paquete generado; `verificacion.resumen` informa 500/500/500.
18. `crear_paquete` con una vivienda repetida → falla.
19–20. Abrir el Excel en Microsoft Excel: 133 columnas, NIU y NIC como texto, acentos correctos; ZIP con la estructura del manual.
21. Descargar cada volumen y comprobar SHA-256 contra el manifiesto.
22. Nuevo despliegue en Vercel → el paquete sigue descargable.
23. Encuestador A intenta `createSignedUrl` de una foto del encuestador B → error.
24. Modo avión durante el formulario → indicador «sin sincronizar»; al volver la señal → «Sincronizado».

## Prueba integral de 500 viviendas

Pendiente. Requiere el proyecto de pruebas con las migraciones aplicadas y el exportador configurado. Procedimiento: crear 500 encuestas aprobadas con datos marcados `PRUEBA`, generar el paquete y comprobar automáticamente conteos, duplicados, NIU, evidencias, estructura y huellas (el exportador ya ejecuta estas verificaciones y falla si alguna no se cumple).
