# Plataforma de caracterización · Programa Colombia Solar (GECELCA)

Aplicación web para registrar visitas casa por casa, diligenciar el **Formato 5 (FO-CS-PR-05) de caracterización socioeconómica**, capturar evidencias, firmas y georreferenciación, revisar la calidad de los registros y generar paquetes de **exactamente 500 viviendas únicas efectivas** con su Excel y su ZIP.

- **Frontend y API:** Next.js 14 (App Router) + TypeScript + Tailwind, desplegado en Vercel.
- **Base de datos, autenticación y archivos:** proyecto **nuevo** de Supabase (`rdzrmxbyqhhgqramzmhm`). RLS en todas las tablas, buckets privados.
- **Exportación:** trabajador Node en GitHub Actions (`worker/`), que genera Excel, CSV, PDF por vivienda, shapefile MAGNA-SIRGAS Origen Nacional y ZIP por volúmenes.

> **Proyecto de Supabase existente:** esta aplicación no lo usa ni lo toca. Toda operación verifica la referencia `rdzrmxbyqhhgqramzmhm` (archivo `supabase/PROYECTO_ESPERADO`, variable `NEXT_PUBLIC_SUPABASE_PROJECT_REF` y `SUPABASE_PROJECT_REF` del exportador) y se detiene si no coincide.

## Estructura

```
app/                 Páginas y rutas de API (Next.js)
  campo/             Encuestador: búsqueda, visita, formulario
  admin/             Panel, viviendas, revisión, paquetes, importación, usuarios, configuración
  api/               Envío validado de encuestas y creación de usuarios (servidor)
components/          Componentes de interfaz
lib/                 Clientes de Supabase, sesión, carga de archivos, modo sin conexión
shared/              Instrumento F5 (JSON) y lógica compartida app ↔ exportador
supabase/migrations/ Esquema, reglas de negocio, RLS y Storage (versionado)
worker/              Generador de paquetes (GitHub Actions)
tests/               Pruebas unitarias (node --test)
docs/                Manual de usuario, decisiones, pruebas, respaldos
```

## Puesta en marcha (una sola vez)

### 1. Base de datos (proyecto nuevo de Supabase)

En el panel de Supabase, **confirme que está en el proyecto `rdzrmxbyqhhgqramzmhm`** (nombre visible arriba a la izquierda). Luego, una de dos:

- **SQL Editor:** pegue y ejecute, en orden, `supabase/migrations/20261028000001_esquema.sql`, `…0002_reglas.sql` y `…0003_seguridad.sql`.
- **Supabase CLI:**
  ```bash
  supabase link --project-ref rdzrmxbyqhhgqramzmhm
  npm run db:push      # verifica el proyecto antes de migrar y se detiene si no coincide
  ```

En **Authentication → Providers → Email**, desactive «Allow new users to sign up». Las cuentas las crea el coordinador desde la app.

**Primer coordinador:** cree el usuario en *Authentication → Users → Add user* (con «Auto Confirm») y ejecute en el SQL Editor:

```sql
insert into public.perfil (id, nombre, rol)
select id, 'NOMBRE DEL COORDINADOR', 'coordinador' from auth.users where email = 'correo@dominio.com';
```

### 2. Repositorio y Vercel

1. Suba el contenido de esta carpeta a un repositorio **nuevo** de GitHub (no al de *reporte-diario*).
2. En Vercel: *Add New → Project → Import* el repositorio. Framework: Next.js (se detecta solo).
3. *Settings → Environment Variables* (Production y Preview):

| Variable | Valor | Tipo |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_PROJECT_REF` | `rdzrmxbyqhhgqramzmhm` | pública |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://rdzrmxbyqhhgqramzmhm.supabase.co` | pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clave `sb_publishable_…` | pública (protegida por RLS) |
| `SUPABASE_SECRET_KEY` | clave `sb_secret_…` (Settings → API Keys) | **Sensitive**, solo servidor |

4. Despliegue. Agregue el dominio de Vercel en Supabase → *Authentication → URL Configuration → Site URL*.

### 3. Exportador (GitHub Actions)

En el repositorio: *Settings → Secrets and variables → Actions → New repository secret*:

- `SUPABASE_URL` = `https://rdzrmxbyqhhgqramzmhm.supabase.co`
- `SUPABASE_PROJECT_REF` = `rdzrmxbyqhhgqramzmhm`
- `SUPABASE_SECRET_KEY` = clave secreta

El flujo `.github/workflows/exportar-paquetes.yml` revisa cada 10 minutos si hay paquetes en cola. También puede ejecutarse a mano en la pestaña *Actions*.

### 4. Carga inicial

1. Ingrese como coordinador → *Configuración*: contrato, contratista, plazo y **texto oficial de tratamiento de datos**.
2. *Selección muestral*: cargue `Entregable_4_Analisis_Barrios_POT GECELCAV5.csv`.
3. *Usuarios*: cree encuestadores y supervisores y asigne barrios.

## Desarrollo local

```bash
cp .env.example .env.local   # complete con los valores del proyecto nuevo
npm install
npm run dev
npm test                     # pruebas unitarias
npm run typecheck
```

## Seguridad

- Solo la clave **publicable** llega al navegador. La clave secreta se usa en dos rutas de servidor (`/api/encuestas/[id]/enviar`, `/api/usuarios`) y en el exportador.
- RLS activa en las 14 tablas; políticas por rol (encuestador, supervisor, coordinador). El rol anónimo no tiene acceso.
- Buckets `evidencias` y `exportaciones` privados; acceso con URL firmadas de 5–10 minutos.
- Las evidencias, intentos cerrados y encuestas enviadas no pueden modificarse por usuarios ordinarios (triggers). Todos los cambios quedan en `auditoria`.
- `.env*` excluidos del repositorio; source maps de producción desactivados.

## Límites del plan Free de Supabase

| Recurso | Free | Necesidad estimada |
|---|---|---|
| Almacenamiento de archivos | 1 GB | ~1,5–2,5 GB por cada 500 viviendas (evidencias) + igual tamaño por cada ZIP |
| Base de datos | 500 MB | ~60 MB para 30.791 viviendas y sus encuestas |
| Tamaño por archivo | 50 MB | ZIP dividido en volúmenes de ≤ 44 MB |
| Pausa por inactividad | 7 días | — |
| Copias de seguridad | No incluidas | Ver `docs/RESPALDOS.md` |

Con el plan Free el almacenamiento se agota antes de completar el primer paquete. Para operación real se requiere el plan **Pro**.

Más detalle: `docs/DECISIONES.md`, `docs/MANUAL_USUARIO.md`, `docs/PRUEBAS.md`, `docs/RESPALDOS.md`.
