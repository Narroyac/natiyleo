-- Pasaporte de Boda — Nati & Leo
-- Migración inicial: tablas, seguridad (RLS) y funciones de acceso por código.
-- Corre este archivo completo en el SQL Editor de Supabase (o vía CLI) una sola vez.

create extension if not exists "pgcrypto";

-- =========================================================
-- TABLAS
-- =========================================================

-- Configuración global de la app (fila única).
create table if not exists app_config (
  id boolean primary key default true,
  event_date date not null default '2026-12-04',
  prize_description text not null default 'Premio físico para los primeros 3 en completar el pasaporte',
  prize_winners_count int not null default 3,
  challenge_duration_minutes int,
  challenge_started_at timestamptz,
  challenge_paused_at timestamptz,
  challenge_extra_seconds int not null default 0,
  admin_email text,
  updated_at timestamptz not null default now(),
  constraint app_config_singleton check (id)
);
insert into app_config (id) values (true) on conflict (id) do nothing;

-- Catálogo de roles/estampillas especiales (100% editable desde el admin).
create table if not exists special_badges (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  icon_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Los 11 retos de actividad, precargados.
create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  requires_photo boolean not null default true,
  requires_text boolean not null default false,
  sort_order int not null,
  icon_url text,
  created_at timestamptz not null default now()
);

-- Invitados.
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,          -- nombre real, para "Pasaporte de [Nombre]"
  invitation_label text not null,    -- etiqueta original tal como venía del Excel/Sheet
  code text not null unique,
  is_companion boolean not null default false,
  companion_of uuid references guests(id) on delete set null,
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending','confirmed','declined')),
  menu_choice text check (menu_choice in ('lomo','pechuga')),
  dietary_notes text,
  table_number int,
  badge_ids uuid[] not null default '{}',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists guests_code_idx on guests (code);
create index if not exists guests_companion_of_idx on guests (companion_of);

-- Envíos de retos (foto y/o texto).
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  photo_url text,
  text_content text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (guest_id, challenge_id)
);
create index if not exists submissions_guest_idx on submissions (guest_id);
create index if not exists submissions_challenge_idx on submissions (challenge_id);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
-- Modelo de acceso:
--  - Invitados: nunca usan Supabase Auth (sin cuenta). Todo su acceso pasa por
--    funciones RPC de abajo, que validan su "code" internamente (SECURITY DEFINER).
--    Esto evita exponer la tabla completa de invitados (nombres, mesas, RSVP) a
--    cualquiera que tenga la anon key.
--  - Admin (Nati/Leo/planner): una sola cuenta compartida de Supabase Auth
--    (se crea en la Fase 3, cuando se construya el login del panel). Cualquier
--    policy que pida auth.role() = 'authenticated' solo la cumple esa cuenta admin.

alter table app_config enable row level security;
alter table special_badges enable row level security;
alter table challenges enable row level security;
alter table guests enable row level security;
alter table submissions enable row level security;

-- Admin: acceso total a todo.
create policy "admin_full_access_config" on app_config for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin_full_access_badges" on special_badges for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin_full_access_challenges" on challenges for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin_full_access_guests" on guests for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin_full_access_submissions" on submissions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Público (anon, sin login): solo lo estrictamente necesario para pintar la UI.
create policy "public_read_challenges" on challenges for select using (true);
create policy "public_read_active_badges" on special_badges for select using (is_active = true);
-- Galería abierta: solo fotos no ocultas.
create policy "public_read_gallery" on submissions for select
  using (is_hidden = false and photo_url is not null);

-- Vista segura de solo los campos del cronómetro (para el conteo regresivo en el
-- celular del invitado, si aplica, y para cualquier vista pública futura).
create or replace view public_timer as
  select challenge_duration_minutes, challenge_started_at, challenge_paused_at, challenge_extra_seconds
  from app_config;
grant select on public_timer to anon, authenticated;

-- =========================================================
-- FUNCIONES RPC — acceso de invitados por código (sin auth)
-- =========================================================

-- Trae el pasaporte del invitado dueño de ese código. Null si no existe.
create or replace function get_guest_by_code(p_code text)
returns table (
  id uuid, first_name text, invitation_label text, code text,
  is_companion boolean, rsvp_status text, menu_choice text,
  dietary_notes text, table_number int, badge_ids uuid[], completed_at timestamptz
)
language sql security definer set search_path = public as $$
  select id, first_name, invitation_label, code, is_companion, rsvp_status,
         menu_choice, dietary_notes, table_number, badge_ids, completed_at
  from guests where code = upper(trim(p_code));
$$;
grant execute on function get_guest_by_code(text) to anon;

-- Retos ya completados por ese invitado (para pintar la grilla de estampillas).
create or replace function get_guest_submissions(p_code text)
returns table (challenge_id uuid, photo_url text, text_content text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select s.challenge_id, s.photo_url, s.text_content, s.created_at
  from submissions s join guests g on g.id = s.guest_id
  where g.code = upper(trim(p_code));
$$;
grant execute on function get_guest_submissions(text) to anon;

-- Reto 1: confirmar asistencia.
create or replace function submit_rsvp(p_code text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_guest_id uuid; v_challenge_id uuid;
begin
  if p_status not in ('confirmed','declined') then
    raise exception 'estado de rsvp inválido';
  end if;
  select id into v_guest_id from guests where code = upper(trim(p_code));
  if v_guest_id is null then raise exception 'código no encontrado'; end if;

  update guests set rsvp_status = p_status, updated_at = now() where id = v_guest_id;

  if p_status = 'confirmed' then
    select id into v_challenge_id from challenges where sort_order = 1;
    if v_challenge_id is not null then
      insert into submissions (guest_id, challenge_id)
        values (v_guest_id, v_challenge_id)
        on conflict (guest_id, challenge_id) do nothing;
    end if;
  end if;
end $$;
grant execute on function submit_rsvp(text, text) to anon;

-- Reto 2: elegir menú.
create or replace function submit_menu(p_code text, p_menu text, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare v_guest_id uuid; v_challenge_id uuid;
begin
  if p_menu not in ('lomo','pechuga') then
    raise exception 'opción de menú inválida';
  end if;
  select id into v_guest_id from guests where code = upper(trim(p_code));
  if v_guest_id is null then raise exception 'código no encontrado'; end if;

  update guests set menu_choice = p_menu, dietary_notes = p_notes, updated_at = now()
    where id = v_guest_id;

  select id into v_challenge_id from challenges where sort_order = 2;
  if v_challenge_id is not null then
    insert into submissions (guest_id, challenge_id)
      values (v_guest_id, v_challenge_id)
      on conflict (guest_id, challenge_id) do nothing;
  end if;
end $$;
grant execute on function submit_menu(text, text, text) to anon;

-- Retos 3-11: subir foto y/o texto. Marca completed_at cuando ya hizo los 11.
create or replace function submit_challenge(
  p_code text, p_challenge_id uuid, p_photo_url text default null, p_text_content text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_guest_id uuid; v_total int; v_done int;
begin
  select id into v_guest_id from guests where code = upper(trim(p_code));
  if v_guest_id is null then raise exception 'código no encontrado'; end if;
  if p_photo_url is null and p_text_content is null then
    raise exception 'se necesita foto o texto';
  end if;

  insert into submissions (guest_id, challenge_id, photo_url, text_content)
    values (v_guest_id, p_challenge_id, p_photo_url, p_text_content)
    on conflict (guest_id, challenge_id)
    do update set photo_url = coalesce(excluded.photo_url, submissions.photo_url),
                  text_content = coalesce(excluded.text_content, submissions.text_content);

  select count(*) into v_total from challenges;
  select count(*) into v_done from submissions where guest_id = v_guest_id;

  if v_done >= v_total then
    update guests set completed_at = coalesce(completed_at, now()) where id = v_guest_id;
  end if;
end $$;
grant execute on function submit_challenge(text, uuid, text, text) to anon;

-- =========================================================
-- STORAGE — buckets
-- =========================================================
-- stamps: íconos de estampilla, reemplazables por Nati sin tocar código.
-- photos: fotos subidas por invitados durante los retos.
insert into storage.buckets (id, name, public)
  values ('stamps', 'stamps', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('photos', 'photos', true)
  on conflict (id) do nothing;

-- Lectura pública de ambos buckets (estampillas visibles para todos, galería abierta).
create policy "public_read_stamps" on storage.objects for select
  using (bucket_id = 'stamps');
create policy "public_read_photos" on storage.objects for select
  using (bucket_id = 'photos');

-- Cualquiera (incluso sin login) puede subir a "photos" — es el flujo de los
-- invitados sin cuenta. El admin puede ocultar/eliminar desde el panel.
create policy "anon_upload_photos" on storage.objects for insert
  with check (bucket_id = 'photos');

-- Solo el admin puede escribir/editar/borrar en "stamps" y borrar de "photos".
create policy "admin_write_stamps" on storage.objects for insert
  with check (bucket_id = 'stamps' and auth.role() = 'authenticated');
create policy "admin_update_stamps" on storage.objects for update
  using (bucket_id = 'stamps' and auth.role() = 'authenticated');
create policy "admin_delete_stamps" on storage.objects for delete
  using (bucket_id = 'stamps' and auth.role() = 'authenticated');
create policy "admin_delete_photos" on storage.objects for delete
  using (bucket_id = 'photos' and auth.role() = 'authenticated');
