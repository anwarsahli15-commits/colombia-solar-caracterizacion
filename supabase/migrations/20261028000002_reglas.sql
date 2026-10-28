-- Reglas de negocio en la base de datos: triggers, vistas y funciones.

-- ───────────── Auditoría ─────────────
create or replace function public.jsonb_cambios(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb)
  from jsonb_each(coalesce(a, '{}'::jsonb)) k
  where (coalesce(b, '{}'::jsonb) -> k.key) is distinct from k.value
$$;

create or replace function public.tg_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb; v_despues jsonb; v_id text;
begin
  if tg_op = 'INSERT' then
    insert into auditoria (tabla, registro_id, accion, despues)
    values (tg_table_name, to_jsonb(new) ->> 'id', 'INSERT', to_jsonb(new) - 'respuestas' - 'datos_muestra');
    return null;
  elsif tg_op = 'DELETE' then
    insert into auditoria (tabla, registro_id, accion, antes)
    values (tg_table_name, coalesce(to_jsonb(old) ->> 'id', to_jsonb(old)::text), 'DELETE', to_jsonb(old));
    return null;
  end if;
  if tg_table_name = 'encuesta' then
    -- Los autoguardados de borradores no se auditan campo a campo.
    if (to_jsonb(old) ->> 'estado') = 'borrador' and (to_jsonb(new) ->> 'estado') = 'borrador' then
      return null;
    end if;
  end if;
  v_antes := jsonb_cambios(to_jsonb(old), to_jsonb(new)) - 'version' - 'actualizado';
  v_despues := jsonb_cambios(to_jsonb(new), to_jsonb(old)) - 'version' - 'actualizado';
  if v_antes ? 'respuestas' then
    v_antes := jsonb_set(v_antes, '{respuestas}', jsonb_cambios(to_jsonb(old) -> 'respuestas', to_jsonb(new) -> 'respuestas'));
    v_despues := jsonb_set(v_despues, '{respuestas}', jsonb_cambios(to_jsonb(new) -> 'respuestas', to_jsonb(old) -> 'respuestas'));
  end if;
  if v_antes = '{}'::jsonb and v_despues = '{}'::jsonb then return null; end if;
  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'clave');
  insert into auditoria (tabla, registro_id, accion, antes, despues)
  values (tg_table_name, v_id, 'UPDATE', v_antes, v_despues);
  return null;
end $$;

create trigger auditar_perfil after insert or update or delete on public.perfil for each row execute function public.tg_auditar();
create trigger auditar_config after update on public.config for each row execute function public.tg_auditar();
create trigger auditar_vivienda after update or delete on public.vivienda for each row execute function public.tg_auditar();
create trigger auditar_asignacion after insert or delete on public.asignacion for each row execute function public.tg_auditar();
create trigger auditar_intento after insert or update or delete on public.intento_visita for each row execute function public.tg_auditar();
create trigger auditar_encuesta after insert or update or delete on public.encuesta for each row execute function public.tg_auditar();
create trigger auditar_evidencia after insert or delete on public.evidencia for each row execute function public.tg_auditar();
create trigger auditar_paquete after insert or update or delete on public.paquete for each row execute function public.tg_auditar();

-- ───────────── Intentos de visita ─────────────
create or replace function public.tg_intento_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cerradas int; v_extra int; v_umbral numeric; v_ruta text; v_hay boolean;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('vivienda:' || new.vivienda_id::text));
    if auth.uid() is not null then new.encuestador_id := auth.uid(); end if;
    new.inicio := now(); new.cerrado := false; new.cerrado_en := null;
    new.resultado := null; new.gps_excepcion := null; new.foto_fachada := null;
    if exists (select 1 from intento_visita where vivienda_id = new.vivienda_id and not cerrado
               and inicio > now() - interval '12 hours') then
      raise exception 'Ya hay una visita abierta para esta vivienda.';
    end if;
    select true, ruta into v_hay, v_ruta from encuesta where vivienda_id = new.vivienda_id and vigente;
    if coalesce(v_hay, false) and coalesce(v_ruta, '') <> 'reprogramada' then
      raise exception 'La vivienda ya fue atendida; no requiere nuevas visitas.';
    end if;
    select count(*) into v_cerradas from intento_visita where vivienda_id = new.vivienda_id and resultado = 'cerrada';
    select intentos_extra into v_extra from vivienda where id = new.vivienda_id;
    if v_cerradas >= 3 + coalesce(v_extra, 0) then
      raise exception 'La vivienda completó tres intentos sin atención. Se requiere autorización del coordinador para una visita adicional.';
    end if;
    select coalesce(max(numero), 0) + 1 into new.numero from intento_visita where vivienda_id = new.vivienda_id;
    return new;
  end if;

  if new.vivienda_id <> old.vivienda_id or new.numero <> old.numero or new.inicio <> old.inicio
     or new.encuestador_id <> old.encuestador_id then
    raise exception 'La vivienda, el número, la fecha y el encuestador de un intento no se pueden modificar.';
  end if;
  if old.cerrado and not public.es_coordinador() and auth.uid() is not null then
    raise exception 'El intento ya está cerrado.';
  end if;
  if new.gps_excepcion is distinct from old.gps_excepcion and new.gps_excepcion in ('aprobada', 'rechazada')
     and auth.uid() is not null and not public.es_coordinador() then
    raise exception 'Solo el coordinador resuelve excepciones de georreferenciación.';
  end if;
  if old.resultado = 'atendida' and new.resultado is distinct from 'atendida'
     and exists (select 1 from encuesta where intento_id = old.id) then
    raise exception 'El intento ya tiene un formulario; no puede marcarse como vivienda cerrada.';
  end if;
  if new.cerrado and not old.cerrado then
    if new.resultado is null then raise exception 'Indique el resultado de la visita.'; end if;
    select coalesce((valor ->> 'gps_precision_m')::numeric, 4) into v_umbral from config where clave = 'umbrales';
    v_umbral := least(coalesce(v_umbral, 4), 4);
    if not ((new.lat is not null and new.lon is not null and new.precision_m is not null and new.precision_m <= v_umbral)
            or new.gps_excepcion = 'aprobada') then
      raise exception 'La ubicación no cumple la precisión exigida (≤ % m). Reintente o solicite una excepción.', v_umbral;
    end if;
    if new.resultado = 'cerrada' and new.foto_fachada is null then
      raise exception 'Falta la fotografía del inmueble.';
    end if;
    if new.resultado = 'atendida' and not exists (select 1 from encuesta where intento_id = new.id and estado <> 'borrador') then
      raise exception 'El formulario de la visita no ha sido enviado.';
    end if;
    new.cerrado_en := now();
  end if;
  return new;
end $$;
create trigger intento_antes before insert or update on public.intento_visita
  for each row execute function public.tg_intento_antes();

-- ───────────── Encuestas ─────────────
create or replace function public.tg_encuesta_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare i record;
begin
  if tg_op = 'INSERT' then
    select * into i from intento_visita where id = new.intento_id;
    if not found or i.vivienda_id <> new.vivienda_id then raise exception 'Intento de visita inválido.'; end if;
    if i.cerrado then raise exception 'El intento ya está cerrado.'; end if;
    if auth.uid() is not null then new.encuestador_id := auth.uid(); end if;
    if i.encuestador_id <> new.encuestador_id then raise exception 'El intento pertenece a otro encuestador.'; end if;
    new.estado := 'borrador'; new.version := 1; new.vigente := true; new.ruta := null;
    new.enviada_en := null; new.validada_por := null; new.aprobada_por := null;
    update encuesta set vigente = false where vivienda_id = new.vivienda_id and vigente and ruta = 'reprogramada';
    update intento_visita set resultado = 'atendida' where id = new.intento_id;
    return new;
  end if;

  if new.vivienda_id <> old.vivienda_id or new.intento_id <> old.intento_id
     or new.encuestador_id <> old.encuestador_id or new.codigo_registro <> old.codigo_registro
     or new.instrumento_version <> old.instrumento_version then
    raise exception 'Campos protegidos de la encuesta.';
  end if;
  if new.vigente is distinct from old.vigente and auth.uid() is not null and not public.es_coordinador()
     and not (old.ruta = 'reprogramada' and new.vigente = false) then
    raise exception 'No autorizado para cambiar la vigencia de la encuesta.';
  end if;
  if new.respuestas is distinct from old.respuestas then
    if public.mi_rol() = 'supervisor' then raise exception 'El supervisor no modifica respuestas; devuelva la encuesta para corrección.'; end if;
    if old.estado not in ('borrador', 'correccion') and auth.uid() is not null and not public.es_coordinador() then
      raise exception 'La encuesta no está en edición.';
    end if;
    if exists (select 1 from paquete_vivienda pv join paquete p on p.id = pv.paquete_id
               where pv.encuesta_id = old.id and p.estado <> 'liberado') then
      raise exception 'La encuesta está incluida en un paquete; requiere el procedimiento de corrección autorizado.';
    end if;
    new.version := old.version + 1;
  end if;
  if new.estado is distinct from old.estado and auth.uid() is not null then
    if new.estado = 'aprobada' and not public.es_coordinador() then raise exception 'Solo el coordinador aprueba encuestas.'; end if;
    if new.estado in ('validada', 'anulada') and not public.es_staff() then raise exception 'No autorizado.'; end if;
    if new.estado = 'enviada' and not public.es_staff() then raise exception 'El envío se registra a través del servidor.'; end if;
  end if;
  if new.estado = 'validada' and old.estado <> 'validada' then new.validada_por := auth.uid(); new.validada_en := now(); end if;
  if new.estado = 'aprobada' and old.estado <> 'aprobada' then new.aprobada_por := auth.uid(); new.aprobada_en := now(); end if;
  new.actualizado := now();
  return new;
end $$;
create trigger encuesta_antes before insert or update on public.encuesta
  for each row execute function public.tg_encuesta_antes();

-- Las evidencias son inmutables: no se actualizan ni se borran desde la aplicación.
create or replace function public.tg_evidencia_inmutable() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.es_coordinador() then
    raise exception 'Las evidencias no se pueden modificar ni eliminar.';
  end if;
  return coalesce(new, old);
end $$;
create trigger evidencia_inmutable before update or delete on public.evidencia
  for each row execute function public.tg_evidencia_inmutable();

-- ───────────── Vistas ─────────────
create or replace view public.v_vivienda_estado with (security_invoker = on) as
select
  v.id, v.niu, v.direccion, v.barrio_id, b.nombre as barrio, v.estrato_muestra, v.ranking,
  coalesce(i.intentos, 0) as intentos,
  coalesce(i.sin_atencion, 0) as sin_atencion,
  coalesce(i.atendida, false) as atendida,
  i.ultima_visita,
  e.id as encuesta_id, e.ruta, e.estado as estado_calidad, e.encuestador_id,
  pv.paquete_id, p.numero as paquete_numero, p.estado as paquete_estado,
  case
    when e.id is not null and e.estado <> 'borrador' and e.ruta = 'completa' then 'atendida_completa'
    when e.id is not null and e.estado <> 'borrador' and e.ruta = 'desistimiento' then 'atendida_desistimiento'
    when e.id is not null and e.estado <> 'borrador' and e.ruta = 'sin_datos' then 'atendida_sin_datos'
    when e.id is not null and e.estado <> 'borrador' and e.ruta = 'reprogramada' then 'atendida_reprogramada'
    when e.id is not null then 'atendida_incompleta'
    -- La encuesta de otro encuestador no es visible para un encuestador, pero el intento sí.
    when coalesce(i.atendida, false) then 'atendida_otro'
    when coalesce(i.sin_atencion, 0) >= 3 then 'no_atendida_3'
    when i.sin_atencion = 2 then 'sin_atencion_2'
    when i.sin_atencion = 1 then 'sin_atencion_1'
    else 'pendiente'
  end as estado_campo
from public.vivienda v
join public.barrio b on b.id = v.barrio_id
left join (
  select vivienda_id, count(*) as intentos,
         count(*) filter (where resultado = 'cerrada') as sin_atencion,
         bool_or(resultado = 'atendida') as atendida,
         max(inicio) as ultima_visita
  from public.intento_visita group by vivienda_id
) i on i.vivienda_id = v.id
left join public.encuesta e on e.vivienda_id = v.id and e.vigente
left join public.paquete_vivienda pv on pv.vivienda_id = v.id
left join public.paquete p on p.id = pv.paquete_id;

-- ───────────── Funciones para la aplicación ─────────────
create or replace function public.buscar_viviendas(p_barrio int, p_q text)
returns table (id uuid, niu text, direccion text, estrato text, estado_campo text, intentos bigint, sim real)
language sql stable security invoker set search_path = public, extensions as $$
  with c as (
    select v.id, v.niu, v.direccion, v.estrato_muestra,
           case when coalesce(p_q, '') = '' then 0 else word_similarity(p_q, v.direccion_norm) end as sim,
           (coalesce(p_q, '') <> '' and v.direccion_norm like p_q || '%') as prefijo,
           v.ranking
    from public.vivienda v
    where v.barrio_id = p_barrio
      and (coalesce(p_q, '') = ''
           or v.direccion_norm like '%' || p_q || '%'
           or v.niu like '%' || p_q || '%'
           or word_similarity(p_q, v.direccion_norm) > 0.45)
    order by prefijo desc, sim desc, v.ranking nulls last, v.direccion
    limit 40
  )
  select c.id, c.niu, c.direccion, c.estrato_muestra, ve.estado_campo, ve.intentos, c.sim
  from c join public.v_vivienda_estado ve on ve.id = c.id
  order by c.prefijo desc, c.sim desc, c.ranking nulls last, c.direccion
$$;

create or replace function public.indicadores() returns jsonb
language sql stable security invoker set search_path = public as $$
  with v as (select * from public.v_vivienda_estado),
  i as (select count(*) filter (where resultado = 'atendida') as efectivas,
               count(*) filter (where resultado = 'cerrada') as cerradas from public.intento_visita)
  select jsonb_build_object(
    'total', (select count(*) from v),
    'pendientes', (select count(*) from v where estado_campo = 'pendiente'),
    'sin_atencion_1', (select count(*) from v where estado_campo = 'sin_atencion_1'),
    'sin_atencion_2', (select count(*) from v where estado_campo = 'sin_atencion_2'),
    'no_atendida_3', (select count(*) from v where estado_campo = 'no_atendida_3'),
    'visitas_efectivas', (select efectivas from i),
    'intentos_sin_atencion', (select cerradas from i),
    'viviendas_efectivas', (select count(*) from v where atendida),
    'participantes', (select count(*) from v where estado_campo = 'atendida_completa'),
    'desistimientos', (select count(*) from v where estado_campo = 'atendida_desistimiento'),
    'sin_datos', (select count(*) from v where estado_campo = 'atendida_sin_datos'),
    'reprogramadas', (select count(*) from v where estado_campo = 'atendida_reprogramada'),
    'incompletas', (select count(*) from v where estado_campo = 'atendida_incompleta'),
    'pendientes_revision', (select count(*) from v where estado_calidad = 'enviada'),
    'en_correccion', (select count(*) from v where estado_calidad = 'correccion'),
    'validadas', (select count(*) from v where estado_calidad = 'validada'),
    'aprobadas', (select count(*) from v where estado_calidad = 'aprobada'),
    'aptas', (select count(*) from v where estado_calidad = 'aprobada' and ruta in ('completa', 'desistimiento', 'sin_datos') and paquete_id is null),
    'en_paquete_en_proceso', (select count(*) from v where paquete_estado in ('en_cola', 'generando')),
    'exportadas', (select count(*) from v where paquete_estado = 'generado'),
    'certificados_pendientes', (select count(*) from public.encuesta where vigente and estado <> 'anulada' and respuestas ->> 'cert_pendiente' = 'true'),
    'excepciones_gps', (select count(*) from public.intento_visita where gps_excepcion = 'solicitada'),
    'devoluciones_por_motivo', (select coalesce(jsonb_agg(jsonb_build_object('motivo', observacion, 'total', n) order by n desc), '[]'::jsonb)
                                from (select observacion, count(*) n from public.revision where accion = 'devolver' group by observacion order by count(*) desc limit 15) d),
    'por_barrio', (select coalesce(jsonb_agg(x order by x ->> 'barrio'), '[]'::jsonb) from (
        select jsonb_build_object('barrio', barrio, 'total', count(*),
          'pendientes', count(*) filter (where estado_campo = 'pendiente'),
          'sin_atencion', count(*) filter (where estado_campo in ('sin_atencion_1', 'sin_atencion_2')),
          'no_atendidas', count(*) filter (where estado_campo = 'no_atendida_3'),
          'efectivas', count(*) filter (where atendida),
          'participantes', count(*) filter (where estado_campo = 'atendida_completa'),
          'desistimientos', count(*) filter (where estado_campo = 'atendida_desistimiento'),
          'aptas', count(*) filter (where estado_calidad = 'aprobada' and paquete_id is null and ruta in ('completa', 'desistimiento', 'sin_datos')),
          'exportadas', count(*) filter (where paquete_estado = 'generado')) as x
        from v group by barrio) s),
    'por_encuestador', (select coalesce(jsonb_agg(x order by x ->> 'nombre'), '[]'::jsonb) from (
        select jsonb_build_object('nombre', p.nombre,
          'intentos', (select count(*) from public.intento_visita iv where iv.encuestador_id = p.id),
          'sin_atencion', (select count(*) from public.intento_visita iv where iv.encuestador_id = p.id and iv.resultado = 'cerrada'),
          'efectivas', (select count(*) from public.intento_visita iv where iv.encuestador_id = p.id and iv.resultado = 'atendida'),
          'enviadas', (select count(*) from public.encuesta e where e.encuestador_id = p.id and e.vigente and e.estado <> 'borrador'),
          'en_correccion', (select count(*) from public.encuesta e where e.encuestador_id = p.id and e.vigente and e.estado = 'correccion'),
          'aprobadas', (select count(*) from public.encuesta e where e.encuestador_id = p.id and e.vigente and e.estado = 'aprobada')) as x
        from public.perfil p where p.rol = 'encuestador') s)
  )
$$;

create or replace function public.viviendas_aptas()
returns table (vivienda_id uuid, encuesta_id uuid, niu text, direccion text, barrio text, ruta text,
               aprobada_en timestamptz, observaciones int)
language sql stable security invoker set search_path = public as $$
  select v.id, e.id, v.niu, v.direccion, b.nombre, e.ruta, e.aprobada_en,
         (select count(*)::int from public.revision r where r.encuesta_id = e.id and r.accion = 'observacion')
  from public.encuesta e
  join public.vivienda v on v.id = e.vivienda_id
  join public.barrio b on b.id = v.barrio_id
  where e.vigente and e.estado = 'aprobada' and e.ruta in ('completa', 'desistimiento', 'sin_datos')
    and not exists (select 1 from public.paquete_vivienda pv where pv.vivienda_id = v.id)
  order by e.aprobada_en, v.niu
$$;

create or replace function public.revisar_encuesta(p_encuesta uuid, p_accion text, p_observacion text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if not public.es_staff() then raise exception 'No autorizado.'; end if;
  select * into e from encuesta where id = p_encuesta for update;
  if not found then raise exception 'Encuesta no encontrada.'; end if;
  if p_accion = 'observacion' then
    if coalesce(trim(p_observacion), '') = '' then raise exception 'Escriba la observación.'; end if;
  elsif p_accion = 'devolver' then
    if e.estado not in ('enviada', 'validada') then raise exception 'Solo se devuelven encuestas enviadas o validadas.'; end if;
    if coalesce(trim(p_observacion), '') = '' then raise exception 'Indique qué debe corregirse.'; end if;
    update encuesta set estado = 'correccion' where id = p_encuesta;
  elsif p_accion = 'validar' then
    if e.estado <> 'enviada' then raise exception 'Solo se validan encuestas enviadas.'; end if;
    update encuesta set estado = 'validada' where id = p_encuesta;
  elsif p_accion = 'aprobar' then
    if not public.es_coordinador() then raise exception 'Solo el coordinador aprueba.'; end if;
    if e.estado <> 'validada' then raise exception 'La encuesta debe estar validada por un supervisor.'; end if;
    if e.respuestas ->> 'cert_pendiente' = 'true' and not exists (
         select 1 from revision where encuesta_id = p_encuesta and accion = 'excepcion_certificado') then
      raise exception 'Falta el certificado de tradición y libertad (o una excepción del coordinador).';
    end if;
    update encuesta set estado = 'aprobada' where id = p_encuesta;
  elsif p_accion = 'excepcion_certificado' then
    if not public.es_coordinador() then raise exception 'Solo el coordinador autoriza excepciones.'; end if;
    if coalesce(trim(p_observacion), '') = '' then raise exception 'Justifique la excepción.'; end if;
  else
    raise exception 'Acción no válida.';
  end if;
  insert into revision (encuesta_id, accion, observacion) values (p_encuesta, p_accion, nullif(trim(p_observacion), ''));
end $$;

create or replace function public.resolver_excepcion_gps(p_intento uuid, p_aprobar boolean, p_observacion text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_coordinador() then raise exception 'No autorizado.'; end if;
  if coalesce(trim(p_observacion), '') = '' then raise exception 'Justifique la decisión.'; end if;
  update intento_visita
     set gps_excepcion = case when p_aprobar then 'aprobada' else 'rechazada' end,
         observacion = concat_ws(' | ', observacion, 'Excepción GPS: ' || trim(p_observacion))
   where id = p_intento and gps_excepcion = 'solicitada';
  if not found then raise exception 'No hay una excepción pendiente para este intento.'; end if;
  if p_aprobar then
    update intento_visita set cerrado = true
     where id = p_intento and not cerrado and resultado = 'cerrada' and foto_fachada is not null;
  end if;
end $$;

create or replace function public.autorizar_visita_extra(p_vivienda uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_coordinador() then raise exception 'No autorizado.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indique el motivo.'; end if;
  update vivienda set intentos_extra = intentos_extra + 1 where id = p_vivienda;
  insert into auditoria (tabla, registro_id, accion, despues)
  values ('vivienda', p_vivienda::text, 'VISITA_EXTRA_AUTORIZADA', jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- Importación de la selección muestral (sin sobrescribir viviendas existentes)
create or replace function public.importar_iniciar(p_archivo text, p_leidas int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.es_coordinador() then raise exception 'No autorizado.'; end if;
  insert into importacion (archivo, leidas) values (p_archivo, p_leidas) returning id into v_id;
  return v_id;
end $$;

create or replace function public.importar_lote(p_importacion uuid, p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ins int; v_tot int;
begin
  if not public.es_coordinador() then raise exception 'No autorizado.'; end if;
  if jsonb_array_length(p_filas) > 2000 then raise exception 'Lote demasiado grande.'; end if;
  insert into barrio (nombre, localidad, zona)
  select distinct on (f ->> 'barrio') f ->> 'barrio', f ->> 'localidad', f ->> 'zona'
  from jsonb_array_elements(p_filas) f
  where coalesce(f ->> 'barrio', '') <> ''
  on conflict (nombre) do nothing;
  with ins as (
    insert into vivienda (niu, direccion, direccion_norm, barrio_id, ranking, codigo_dane, ubicacion,
                          estrato_muestra, lat_muestra, lon_muestra, consumo_muestra, datos_muestra, importacion_id)
    select f ->> 'niu', f ->> 'direccion', f ->> 'direccion_norm', b.id, (f ->> 'ranking')::int,
           f ->> 'codigo_dane', f ->> 'ubicacion', f ->> 'estrato', (f ->> 'lat')::float8, (f ->> 'lon')::float8,
           (f ->> 'consumo')::numeric, coalesce(f -> 'datos', '{}'::jsonb), p_importacion
    from jsonb_array_elements(p_filas) f
    join barrio b on b.nombre = f ->> 'barrio'
    on conflict (niu) do nothing
    returning 1)
  select count(*) into v_ins from ins;
  v_tot := jsonb_array_length(p_filas);
  update importacion set aceptadas = aceptadas + v_ins, existentes = existentes + (v_tot - v_ins) where id = p_importacion;
  return jsonb_build_object('insertadas', v_ins, 'existentes', v_tot - v_ins);
end $$;

create or replace function public.importar_finalizar(p_importacion uuid, p_rechazadas int, p_errores jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_coordinador() then raise exception 'No autorizado.'; end if;
  update importacion set rechazadas = p_rechazadas, errores = coalesce(p_errores, '[]'::jsonb), estado = 'completada'
  where id = p_importacion;
end $$;

-- ───────────── Paquetes ─────────────
create or replace function public.crear_paquete(p_viviendas uuid[], p_instrumento text, p_plantilla text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_paquete uuid; v_unicas int; v_aptas int;
begin
  if not public.es_coordinador() then raise exception 'Solo el coordinador genera paquetes.'; end if;
  select count(distinct x) into v_unicas from unnest(p_viviendas) x;
  if coalesce(cardinality(p_viviendas), 0) <> 500 or v_unicas <> 500 then
    raise exception 'El paquete debe tener exactamente 500 viviendas únicas (recibidas: %, únicas: %).',
      coalesce(cardinality(p_viviendas), 0), v_unicas;
  end if;
  perform pg_advisory_xact_lock(hashtext('crear_paquete'));
  perform 1 from encuesta where vivienda_id = any (p_viviendas) and vigente for update;
  select count(*) into v_aptas from encuesta e
  where e.vivienda_id = any (p_viviendas) and e.vigente and e.estado = 'aprobada'
    and e.ruta in ('completa', 'desistimiento', 'sin_datos')
    and not exists (select 1 from paquete_vivienda pv where pv.vivienda_id = e.vivienda_id);
  if v_aptas <> 500 then
    raise exception 'Solo % de las 500 viviendas seleccionadas están aptas para exportar. Actualice la selección.', v_aptas;
  end if;
  insert into paquete (instrumento_version, plantilla_version, conteos)
  values (p_instrumento, p_plantilla, jsonb_build_object(
    'viviendas', 500,
    'participantes', (select count(*) from encuesta where vivienda_id = any (p_viviendas) and vigente and ruta = 'completa'),
    'desistimientos', (select count(*) from encuesta where vivienda_id = any (p_viviendas) and vigente and ruta = 'desistimiento'),
    'sin_datos', (select count(*) from encuesta where vivienda_id = any (p_viviendas) and vigente and ruta = 'sin_datos')))
  returning id into v_paquete;
  insert into paquete_vivienda (paquete_id, vivienda_id, encuesta_id)
  select v_paquete, e.vivienda_id, e.id from encuesta e where e.vivienda_id = any (p_viviendas) and e.vigente;
  return v_paquete;
end $$;

create or replace function public.gestionar_paquete_fallido(p_paquete uuid, p_accion text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_coordinador() then raise exception 'No autorizado.'; end if;
  if p_accion = 'reintentar' then
    update paquete set estado = 'en_cola', error = null where id = p_paquete and estado = 'fallido';
  elsif p_accion = 'liberar' then
    delete from paquete_vivienda where paquete_id = p_paquete
      and exists (select 1 from paquete where id = p_paquete and estado = 'fallido');
    update paquete set estado = 'liberado' where id = p_paquete and estado = 'fallido';
  else
    raise exception 'Acción no válida.';
  end if;
  if not found then raise exception 'El paquete no está en estado fallido.'; end if;
end $$;

-- Solo para el servidor (service_role): envío validado y trabajador de exportación.
create or replace function public.registrar_envio(p_encuesta uuid, p_usuario uuid, p_version int, p_respuestas jsonb, p_ruta text)
returns void language plpgsql security definer set search_path = public as $$
declare v_intento uuid;
begin
  update encuesta set respuestas = p_respuestas, ruta = p_ruta, estado = 'enviada', enviada_en = now()
   where id = p_encuesta and encuestador_id = p_usuario and version = p_version and estado in ('borrador', 'correccion')
  returning intento_id into v_intento;
  if not found then raise exception 'CONFLICTO: la encuesta cambió en otro dispositivo o ya fue enviada.'; end if;
  update intento_visita set cerrado = true where id = v_intento and not cerrado;
end $$;

create or replace function public.reclamar_paquete() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  perform pg_advisory_xact_lock(hashtext('reclamar_paquete'));
  select * into p from paquete where estado = 'en_cola' order by creado limit 1 for update skip locked;
  if not found then return null; end if;
  update paquete set estado = 'generando', inicio_generacion = now(), intentos = intentos + 1,
         numero = (select coalesce(max(numero), 0) + 1 from paquete where numero is not null)
   where id = p.id returning * into p;
  return to_jsonb(p);
end $$;

create or replace function public.finalizar_paquete(p_paquete uuid, p_ok boolean, p_archivos jsonb, p_verificacion jsonb, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_ok then
    update paquete set estado = 'generado', generado_en = now(), archivos = p_archivos, verificacion = p_verificacion, error = null
     where id = p_paquete and estado = 'generando';
  else
    update paquete set estado = 'fallido', numero = null, error = left(p_error, 4000), verificacion = coalesce(p_verificacion, '{}'::jsonb)
     where id = p_paquete and estado = 'generando';
  end if;
  if not found then raise exception 'El paquete no está en generación.'; end if;
end $$;
