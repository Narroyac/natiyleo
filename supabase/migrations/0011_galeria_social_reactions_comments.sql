-- Galería Social (adición) — reacciones y comentarios cortos por foto/video.
-- Sigue el mismo patrón de seguridad que el resto del proyecto: invitados
-- nunca tienen sesión (auth.role() = anon todo el tiempo), así que escriben
-- a través de funciones SECURITY DEFINER que validan su código de invitado
-- (p_code), igual que submit_rsvp / submit_menu / submit_challenge.

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','😂','🥹','🥳','👏🏻')),
  created_at timestamptz not null default now(),
  unique (submission_id, guest_id)
);
create index reactions_submission_id_idx on public.reactions(submission_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  text text not null check (char_length(text) <= 140 and char_length(trim(text)) > 0),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_submission_id_idx on public.comments(submission_id);

alter table public.reactions enable row level security;
alter table public.comments enable row level security;

-- Admin (panel, cuenta autenticada de Nati): acceso total, igual que en el resto de tablas.
create policy admin_full_access_reactions on public.reactions
  for all to public using (auth.role() = 'authenticated');
create policy admin_full_access_comments on public.comments
  for all to public using (auth.role() = 'authenticated');

-- Lectura pública: reacciones y comentarios visibles son datos de la galería
-- compartida (igual que las fotos con is_hidden = false); no exponen nada de
-- la tabla guests, solo un guest_id (uuid) sin significado por sí solo.
create policy public_read_reactions on public.reactions
  for select to public using (true);
create policy public_read_comments on public.comments
  for select to public using (is_hidden = false);

grant select, insert, update, delete on public.reactions to anon, authenticated;
grant select, insert, update, delete on public.comments to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs de escritura para invitados (sin sesión), validan p_code como el resto.
-- ---------------------------------------------------------------------------

create or replace function public.add_reaction(p_code text, p_submission_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_hidden boolean;
begin
  if p_emoji not in ('❤️','😂','🥹','🥳','👏🏻') then
    raise exception 'emoji no permitido';
  end if;

  select id into v_guest_id from guests where code = upper(trim(p_code));
  if v_guest_id is null then
    raise exception 'código no encontrado';
  end if;

  select is_hidden into v_hidden from submissions where id = p_submission_id;
  if v_hidden is null then
    raise exception 'foto no encontrada';
  end if;
  if v_hidden then
    raise exception 'esta foto ya no está disponible';
  end if;

  insert into reactions (submission_id, guest_id, emoji)
    values (p_submission_id, v_guest_id, p_emoji)
    on conflict (submission_id, guest_id)
    do update set emoji = excluded.emoji, created_at = now();
end;
$$;

create or replace function public.remove_reaction(p_code text, p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_guest_id uuid;
begin
  select id into v_guest_id from guests where code = upper(trim(p_code));
  if v_guest_id is null then
    raise exception 'código no encontrado';
  end if;

  delete from reactions where submission_id = p_submission_id and guest_id = v_guest_id;
end;
$$;

create or replace function public.add_comment(p_code text, p_submission_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_hidden boolean;
  v_text text;
begin
  v_text := trim(p_text);
  if v_text = '' or char_length(v_text) > 140 then
    raise exception 'comentario inválido (máximo 140 caracteres)';
  end if;

  select id into v_guest_id from guests where code = upper(trim(p_code));
  if v_guest_id is null then
    raise exception 'código no encontrado';
  end if;

  select is_hidden into v_hidden from submissions where id = p_submission_id;
  if v_hidden is null then
    raise exception 'foto no encontrada';
  end if;
  if v_hidden then
    raise exception 'esta foto ya no está disponible';
  end if;

  insert into comments (submission_id, guest_id, text) values (p_submission_id, v_guest_id, v_text);
end;
$$;

grant execute on function public.add_reaction(text, uuid, text) to anon, authenticated;
grant execute on function public.remove_reaction(text, uuid) to anon, authenticated;
grant execute on function public.add_comment(text, uuid, text) to anon, authenticated;
