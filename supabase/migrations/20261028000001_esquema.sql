-- Colombia Solar · Caracterización de usuarios · Esquema inicial
-- EJECUTAR SOLO EN EL PROYECTO NUEVO DE SUPABASE (ver scripts/verificar-proyecto.mjs).

create extension if not exists pg_trgm with schema extensions;

do $$ begin
  create type public.rol as enum ('encuestador', 'supervisor', 'coordinador');
exception when duplicate_object then null; end $$;

-- ───────────── Usuarios y configuración ─────────────
create table public.perfil (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) >= 3),
  rol public.rol not null default 'encuestador',
  activo boolean not null default true,
  creado timestamptz not null default now()
);

create or replace function public.mi_rol() returns public.rol
language sql stable security definer set search_path = public as $$
  select rol from public.perfil where id = auth.uid() and activo
$$;
create or replace function public.es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() in ('supervisor', 'coordinador'), false)
$$;
create or replace function public.es_coordinador() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() = 'coordinador', false)
$$;

create table public.config (
  clave text primary key,
  valor jsonb not null,
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);
insert into public.config (clave, valor) values
  ('contrato', '{"objeto": "", "contratante": "GECELCA S.A. E.S.P.", "contratista": "", "plazo": ""}'),
  ('ubicacion', '{"departamento": "Atlántico", "municipio": "Barranquilla"}'),
  ('umbrales', '{"gps_precision_m": 4, "consumo_max_kwh": 400, "consumo_desviacion": 0.5, "distancia_muestra_m": 100, "personas_max": 20}'),
  ('texto_tratamiento_datos', '{"texto": ""}')
on conflict (clave) do nothing;

-- ───────────── Selección muestral ─────────────
create table public.barrio (
  id serial primary key,
  nombre text not null unique,
  localidad text,
  zona text
);

create table public.importacion (
  id uuid primary key default gen_random_uuid(),
  archivo text not null,
  usuario uuid not null default auth.uid() references auth.users(id),
  creado timestamptz not null default now(),
  leidas int not null default 0,
  aceptadas int not null default 0,
  existentes int not null default 0,
  rechazadas int not null default 0,
  errores jsonb not null default '[]',
  estado text not null default 'en_proceso' check (estado in ('en_proceso', 'completada', 'fallida'))
);

create table public.vivienda (
  id uuid primary key default gen_random_uuid(),
  niu text not null unique,
  direccion text not null,
  direccion_norm text not null,
  barrio_id int not null references public.barrio(id),
  ranking int,
  codigo_dane text,
  ubicacion text,
  estrato_muestra text,
  lat_muestra double precision,
  lon_muestra double precision,
  consumo_muestra numeric,
  datos_muestra jsonb not null default '{}',
  importacion_id uuid references public.importacion(id),
  intentos_extra int not null default 0 check (intentos_extra between 0 and 5),
  creado timestamptz not null default now()
);
create index vivienda_barrio_idx on public.vivienda (barrio_id);
create index vivienda_dir_trgm on public.vivienda using gin (direccion_norm extensions.gin_trgm_ops);

create table public.asignacion (
  encuestador_id uuid not null references public.perfil(id) on delete cascade,
  barrio_id int not null references public.barrio(id) on delete cascade,
  primary key (encuestador_id, barrio_id)
);

create or replace function public.puede_ver_vivienda(p_vivienda uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_staff() or exists (
    select 1 from public.vivienda v
    join public.asignacion a on a.barrio_id = v.barrio_id
    where v.id = p_vivienda and a.encuestador_id = auth.uid()
  )
$$;

create table public.solicitud_vivienda (
  id uuid primary key default gen_random_uuid(),
  barrio_id int references public.barrio(id),
  direccion_reportada text not null,
  observacion text,
  reportado_por uuid not null default auth.uid() references public.perfil(id),
  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta', 'rechazada')),
  resolucion text,
  creado timestamptz not null default now()
);

-- ───────────── Visitas ─────────────
create table public.intento_visita (
  id uuid primary key default gen_random_uuid(),
  vivienda_id uuid not null references public.vivienda(id),
  numero int not null,
  encuestador_id uuid not null default auth.uid() references public.perfil(id),
  inicio timestamptz not null default now(),
  resultado text check (resultado in ('cerrada', 'atendida')),
  lat double precision,
  lon double precision,
  altitud double precision,
  precision_m double precision check (precision_m is null or precision_m >= 0),
  gps_hora timestamptz,
  gps_dispositivo text,
  gps_intentos int not null default 0,
  gps_excepcion text check (gps_excepcion in ('solicitada', 'aprobada', 'rechazada')),
  foto_fachada text,
  observacion text,
  cerrado boolean not null default false,
  cerrado_en timestamptz,
  unique (vivienda_id, numero)
);
create index intento_vivienda_idx on public.intento_visita (vivienda_id);

create table public.encuesta (
  id uuid primary key default gen_random_uuid(),
  codigo_registro text not null unique default (
    'CS-' || to_char(now() at time zone 'America/Bogota', 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  vivienda_id uuid not null references public.vivienda(id),
  intento_id uuid not null unique references public.intento_visita(id),
  encuestador_id uuid not null default auth.uid() references public.perfil(id),
  instrumento_version text not null,
  ruta text check (ruta in ('completa', 'desistimiento', 'sin_datos', 'reprogramada')),
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviada', 'correccion', 'validada', 'aprobada', 'anulada')),
  vigente boolean not null default true,
  respuestas jsonb not null default '{}',
  version int not null default 1,
  enviada_en timestamptz,
  validada_por uuid references public.perfil(id),
  validada_en timestamptz,
  aprobada_por uuid references public.perfil(id),
  aprobada_en timestamptz,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create unique index encuesta_vigente_uq on public.encuesta (vivienda_id) where vigente;
create index encuesta_estado_idx on public.encuesta (estado) where vigente;

create table public.evidencia (
  id uuid primary key default gen_random_uuid(),
  vivienda_id uuid not null references public.vivienda(id),
  intento_id uuid references public.intento_visita(id),
  encuesta_id uuid references public.encuesta(id),
  campo text not null,
  ruta text not null unique,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'application/pdf')),
  bytes int not null check (bytes > 0 and bytes <= 15728640),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  metadatos jsonb not null default '{}',
  subido_por uuid not null default auth.uid() references public.perfil(id),
  creado timestamptz not null default now(),
  check (intento_id is not null or encuesta_id is not null)
);
create index evidencia_encuesta_idx on public.evidencia (encuesta_id);
create index evidencia_intento_idx on public.evidencia (intento_id);

create table public.revision (
  id uuid primary key default gen_random_uuid(),
  encuesta_id uuid not null references public.encuesta(id),
  revisor_id uuid not null default auth.uid() references public.perfil(id),
  accion text not null check (accion in ('observacion', 'devolver', 'validar', 'aprobar', 'excepcion_certificado')),
  observacion text,
  creado timestamptz not null default now()
);
create index revision_encuesta_idx on public.revision (encuesta_id);

-- ───────────── Paquetes ─────────────
create table public.paquete (
  id uuid primary key default gen_random_uuid(),
  numero int unique,
  estado text not null default 'en_cola'
    check (estado in ('en_cola', 'generando', 'generado', 'fallido', 'liberado')),
  creado_por uuid not null default auth.uid() references public.perfil(id),
  creado timestamptz not null default now(),
  inicio_generacion timestamptz,
  generado_en timestamptz,
  instrumento_version text not null,
  plantilla_version text not null,
  conteos jsonb not null default '{}',
  archivos jsonb not null default '[]',
  verificacion jsonb not null default '{}',
  error text,
  intentos int not null default 0
);

create table public.paquete_vivienda (
  paquete_id uuid not null references public.paquete(id) on delete cascade,
  vivienda_id uuid not null references public.vivienda(id),
  encuesta_id uuid not null references public.encuesta(id),
  primary key (paquete_id, vivienda_id)
);
-- Una vivienda solo puede estar en un paquete ordinario.
create unique index paquete_vivienda_unica on public.paquete_vivienda (vivienda_id);

-- ───────────── Auditoría ─────────────
create table public.auditoria (
  id bigserial primary key,
  tabla text not null,
  registro_id text,
  accion text not null,
  antes jsonb,
  despues jsonb,
  usuario uuid default auth.uid(),
  creado timestamptz not null default now()
);
create index auditoria_registro_idx on public.auditoria (tabla, registro_id);
