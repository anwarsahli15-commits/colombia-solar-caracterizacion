-- Seguridad: RLS en todas las tablas, permisos de funciones y buckets privados.

alter table public.perfil enable row level security;
alter table public.config enable row level security;
alter table public.barrio enable row level security;
alter table public.importacion enable row level security;
alter table public.vivienda enable row level security;
alter table public.asignacion enable row level security;
alter table public.solicitud_vivienda enable row level security;
alter table public.intento_visita enable row level security;
alter table public.encuesta enable row level security;
alter table public.evidencia enable row level security;
alter table public.revision enable row level security;
alter table public.paquete enable row level security;
alter table public.paquete_vivienda enable row level security;
alter table public.auditoria enable row level security;

-- El rol anónimo no accede a nada.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- perfil
create policy perfil_sel on public.perfil for select to authenticated using (id = auth.uid() or public.es_staff());
create policy perfil_upd on public.perfil for update to authenticated using (public.es_coordinador()) with check (public.es_coordinador());

-- config
create policy config_sel on public.config for select to authenticated using (true);
create policy config_upd on public.config for update to authenticated using (public.es_coordinador()) with check (public.es_coordinador());

-- barrio
create policy barrio_sel on public.barrio for select to authenticated using (true);
create policy barrio_ins on public.barrio for insert to authenticated with check (public.es_coordinador());
create policy barrio_upd on public.barrio for update to authenticated using (public.es_coordinador()) with check (public.es_coordinador());

-- importacion
create policy importacion_sel on public.importacion for select to authenticated using (public.es_coordinador());

-- vivienda
create policy vivienda_sel on public.vivienda for select to authenticated using (
  public.es_staff() or exists (select 1 from public.asignacion a where a.barrio_id = vivienda.barrio_id and a.encuestador_id = auth.uid()));

-- asignacion
create policy asignacion_sel on public.asignacion for select to authenticated using (encuestador_id = auth.uid() or public.es_staff());
create policy asignacion_ins on public.asignacion for insert to authenticated with check (public.es_coordinador());
create policy asignacion_del on public.asignacion for delete to authenticated using (public.es_coordinador());

-- solicitud_vivienda
create policy solicitud_sel on public.solicitud_vivienda for select to authenticated using (reportado_por = auth.uid() or public.es_staff());
create policy solicitud_ins on public.solicitud_vivienda for insert to authenticated with check (reportado_por = auth.uid());
create policy solicitud_upd on public.solicitud_vivienda for update to authenticated using (public.es_coordinador()) with check (public.es_coordinador());

-- intento_visita: el historial de una vivienda es visible para quien puede verla
create policy intento_sel on public.intento_visita for select to authenticated using (public.puede_ver_vivienda(vivienda_id));
create policy intento_ins on public.intento_visita for insert to authenticated
  with check (encuestador_id = auth.uid() and public.mi_rol() is not null and public.puede_ver_vivienda(vivienda_id));
create policy intento_upd_propio on public.intento_visita for update to authenticated
  using (encuestador_id = auth.uid() and not cerrado) with check (encuestador_id = auth.uid());
create policy intento_upd_coord on public.intento_visita for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());

-- encuesta: datos personales, solo su autor y el personal de revisión
create policy encuesta_sel on public.encuesta for select to authenticated using (encuestador_id = auth.uid() or public.es_staff());
create policy encuesta_ins on public.encuesta for insert to authenticated with check (encuestador_id = auth.uid());
create policy encuesta_upd_propia on public.encuesta for update to authenticated
  using (encuestador_id = auth.uid() and estado in ('borrador', 'correccion'))
  with check (encuestador_id = auth.uid() and estado in ('borrador', 'correccion'));
create policy encuesta_upd_staff on public.encuesta for update to authenticated
  using (public.es_coordinador()) with check (public.es_coordinador());

-- evidencia
create policy evidencia_sel on public.evidencia for select to authenticated using (subido_por = auth.uid() or public.es_staff());
create policy evidencia_ins on public.evidencia for insert to authenticated
  with check (subido_por = auth.uid() and public.puede_ver_vivienda(vivienda_id)
              and split_part(ruta, '/', 1) = auth.uid()::text);

-- revision
create policy revision_sel on public.revision for select to authenticated using (
  public.es_staff() or exists (select 1 from public.encuesta e where e.id = revision.encuesta_id and e.encuestador_id = auth.uid()));

-- paquetes y auditoría: solo coordinador (las escrituras van por funciones)
create policy paquete_sel on public.paquete for select to authenticated using (public.es_coordinador());
create policy paquete_viv_sel on public.paquete_vivienda for select to authenticated using (public.es_coordinador());
create policy auditoria_sel on public.auditoria for select to authenticated using (public.es_coordinador());

-- Permisos de funciones
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.mi_rol(), public.es_staff(), public.es_coordinador(), public.puede_ver_vivienda(uuid),
  public.buscar_viviendas(int, text), public.indicadores(), public.viviendas_aptas(),
  public.revisar_encuesta(uuid, text, text), public.resolver_excepcion_gps(uuid, boolean, text),
  public.autorizar_visita_extra(uuid, text), public.importar_iniciar(text, int),
  public.importar_lote(uuid, jsonb), public.importar_finalizar(uuid, int, jsonb),
  public.crear_paquete(uuid[], text, text), public.gestionar_paquete_fallido(uuid, text)
  to authenticated;
revoke execute on function public.registrar_envio(uuid, uuid, int, jsonb, text) from authenticated;
revoke execute on function public.reclamar_paquete() from authenticated;
revoke execute on function public.finalizar_paquete(uuid, boolean, jsonb, jsonb, text) from authenticated;
grant execute on function public.registrar_envio(uuid, uuid, int, jsonb, text), public.reclamar_paquete(),
  public.finalizar_paquete(uuid, boolean, jsonb, jsonb, text) to service_role;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('evidencias', 'evidencias', false, 15728640, array['image/jpeg', 'image/png', 'application/pdf']),
  ('exportaciones', 'exportaciones', false, 52428800, null)
on conflict (id) do update set public = false;

-- Evidencias: cada usuario escribe solo en su carpeta {uid}/...; no se reemplazan ni se borran.
create policy evidencias_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = auth.uid()::text);
create policy evidencias_sel on storage.objects for select to authenticated
  using (bucket_id = 'evidencias' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_staff()));
-- Exportaciones: solo lectura para el coordinador; las escribe el trabajador con service_role.
create policy exportaciones_sel on storage.objects for select to authenticated
  using (bucket_id = 'exportaciones' and public.es_coordinador());
