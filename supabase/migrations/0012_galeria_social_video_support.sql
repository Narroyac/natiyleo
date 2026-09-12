-- Galería Social (adición) — soporte de video como evidencia de un reto.
-- photo_url se mantiene con su nombre actual mismo con videos, para no
-- romper el resto del código; media_type indica cuál es cuál.

alter table public.submissions
  add column media_type text not null default 'photo' check (media_type in ('photo','video')),
  add column duration_seconds integer check (duration_seconds is null or duration_seconds <= 30);

comment on column public.submissions.photo_url is 'URL del medio en Supabase Storage — foto o video, según media_type.';
comment on column public.submissions.media_type is 'photo | video — qué tipo de archivo hay en photo_url.';
comment on column public.submissions.duration_seconds is 'Duración del video en segundos (null para fotos). Límite duro de 30s.';

-- submit_challenge: agrega p_media_type / p_duration_seconds, valida el límite de 30s.
drop function if exists public.submit_challenge(text, uuid, text, text);

create function public.submit_challenge(
  p_code text,
  p_challenge_id uuid,
  p_photo_url text default null,
  p_text_content text default null,
  p_media_type text default 'photo',
  p_duration_seconds int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_guest_id uuid; v_total int; v_done int;
begin
  select id into v_guest_id from guests where code = upper(trim(p_code));
  if v_guest_id is null then raise exception 'código no encontrado'; end if;
  if p_photo_url is null and p_text_content is null then
    raise exception 'se necesita foto, video o texto';
  end if;
  if p_media_type not in ('photo','video') then
    raise exception 'tipo de medio inválido';
  end if;
  if p_media_type = 'video' and (p_duration_seconds is null or p_duration_seconds > 30) then
    raise exception 'el video debe durar 30 segundos o menos';
  end if;

  insert into submissions (guest_id, challenge_id, photo_url, text_content, media_type, duration_seconds)
    values (v_guest_id, p_challenge_id, p_photo_url, p_text_content, p_media_type, p_duration_seconds)
    on conflict (guest_id, challenge_id)
    do update set photo_url = coalesce(excluded.photo_url, submissions.photo_url),
                  text_content = coalesce(excluded.text_content, submissions.text_content),
                  media_type = excluded.media_type,
                  duration_seconds = excluded.duration_seconds;

  select count(*) into v_total from challenges;
  select count(*) into v_done from submissions where guest_id = v_guest_id;

  if v_done >= v_total then
    update guests set completed_at = coalesce(completed_at, now()) where id = v_guest_id;
  end if;
end;
$$;

grant execute on function public.submit_challenge(text, uuid, text, text, text, int) to anon, authenticated;

-- get_guest_submissions: agrega media_type / duration_seconds.
drop function if exists public.get_guest_submissions(text);

create function public.get_guest_submissions(p_code text)
returns table(
  challenge_id uuid,
  photo_url text,
  text_content text,
  media_type text,
  duration_seconds int,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select s.challenge_id, s.photo_url, s.text_content, s.media_type, s.duration_seconds, s.created_at
  from submissions s join guests g on g.id = s.guest_id
  where g.code = upper(trim(p_code));
$$;

grant execute on function public.get_guest_submissions(text) to anon, authenticated;

-- get_public_gallery: agrega media_type / duration_seconds.
drop function if exists public.get_public_gallery();

create function public.get_public_gallery()
returns table(
  submission_id uuid,
  photo_url text,
  guest_first_name text,
  challenge_title text,
  media_type text,
  duration_seconds int,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.photo_url, g.first_name, c.title, s.media_type, s.duration_seconds, s.created_at
  from submissions s
  join guests g on g.id = s.guest_id
  join challenges c on c.id = s.challenge_id
  where s.is_hidden = false and s.photo_url is not null
  order by s.created_at desc;
$$;

grant execute on function public.get_public_gallery() to anon, authenticated;
