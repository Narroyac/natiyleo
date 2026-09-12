-- Galería Social (adición) — conteo de comentarios por foto/video en una sola
-- llamada, para mostrar "Ver comentarios (N)" en el feed sin tener que
-- traer el contenido completo de todos los comentarios de entrada (esos se
-- cargan al expandir, con get_comments, que ya existe desde 0014).

create or replace function public.get_gallery_comment_counts()
returns table(submission_id uuid, comment_count bigint)
language sql
security definer
set search_path = public
as $$
  select c.submission_id, count(*)::bigint as comment_count
  from comments c
  where c.is_hidden = false
  group by c.submission_id;
$$;

grant execute on function public.get_gallery_comment_counts() to anon, authenticated;
