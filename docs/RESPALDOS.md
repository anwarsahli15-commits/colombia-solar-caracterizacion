# Copias de seguridad y restauración

El plan Free de Supabase no incluye copias de seguridad automáticas. Hasta pasar a Pro:

## Base de datos (diaria)

```bash
# Requiere la cadena de conexión del proyecto NUEVO (Settings → Database → Connection string).
# Verifique que contenga rdzrmxbyqhhgqramzmhm antes de ejecutar.
pg_dump "$DATABASE_URL" --schema=public --no-owner --format=custom -f respaldo_$(date +%F).dump
```

Guarde el archivo en un almacenamiento privado de GECELCA. Contiene datos personales.

## Archivos

Descargue periódicamente los buckets `evidencias` y `exportaciones` con la CLI de Supabase o con un script que use la clave secreta. Los paquetes generados ya contienen copia de las evidencias de sus 500 viviendas.

## Restauración

1. Crear un proyecto vacío de Supabase.
2. Ejecutar las tres migraciones de `supabase/migrations`.
3. `pg_restore --data-only --no-owner -d "$DATABASE_URL_NUEVO" respaldo.dump`
4. Subir los archivos a los buckets con las mismas rutas.
5. Actualizar las variables de Vercel y los secretos de GitHub con la nueva referencia, y `supabase/PROYECTO_ESPERADO`.

## Conservación de datos

Defina con GECELCA el plazo de conservación de documentos de identidad y fotografías una vez terminado el contrato. La eliminación debe hacerla el coordinador con la clave secreta y quedar registrada.
