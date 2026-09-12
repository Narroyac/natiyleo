-- Galería Social (adición) — lectura de comentarios para la galería pública.
-- add_comment ya existe desde 0011; esto agrega la forma de leerlos con el
-- nombre del invitado, sin exponer nada más de la tabla guests.

create or replace function public.get_comments(p_submission_id uuid)
returns table(id uuid, text text, guest_first_name text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.id, c.text, g.first_name, c.created_at
  from comments c
  join guests g on g.id = c.guest_id
  where c.submission_id = p_submission_id and c.is_hidden = false
  order by c.created_at asc;
$$;

grant execute on function public.get_comments(uuid) to anon, authenticated;

-- Actualizaciones en vivo de comentarios (mismo mecanismo que reactions/podio).
alter publication supabase_realtime add table public.comments;
