-- Galería Social (adición) — permite filtrar "Mis fotos" en el cliente sin
-- exponer guest_id: get_public_gallery ahora acepta un p_code opcional y
-- devuelve is_mine, resuelto server-side (mismo patrón que
-- get_gallery_reactions). Sin p_code, is_mine siempre es false — no rompe
-- a quien la llame sin argumentos.

drop function if exists public.get_public_gallery();

create or replace function public.get_public_gallery(p_code text default null)
returns table(
  submission_id uuid,
  photo_url text,
  guest_first_name text,
  challenge_title text,
  media_type text,
  duration_seconds integer,
  created_at timestamptz,
  is_mine boolean
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.photo_url,
    g.first_name,
    c.title,
    s.media_type,
    s.duration_seconds,
    s.created_at,
    (g.code = upper(trim(p_code))) as is_mine
  from submissions s
  join guests g on g.id = s.guest_id
  join challenges c on c.id = s.challenge_id
  where s.is_hidden = false and s.photo_url is not null
  order by s.created_at desc;
$$;

grant execute on function public.get_public_gallery(text) to anon, authenticated;
