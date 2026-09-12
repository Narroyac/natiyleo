-- Galería Social (adición) — lectura agregada de reacciones para la galería
-- pública. Las tablas y los RPCs de escritura (add_reaction/remove_reaction)
-- ya existen desde 0011; esto solo agrega una forma eficiente de traer, en
-- una sola llamada, el conteo por emoji de cada foto/video y si el invitado
-- que pregunta (p_code) ya reaccionó.

create or replace function public.get_gallery_reactions(p_code text default null)
returns table(submission_id uuid, emoji text, reaction_count bigint, is_mine boolean)
language sql
security definer
set search_path = public
as $$
  select
    r.submission_id,
    r.emoji,
    count(*)::bigint as reaction_count,
    bool_or(g.code = upper(trim(p_code))) as is_mine
  from reactions r
  join guests g on g.id = r.guest_id
  group by r.submission_id, r.emoji;
$$;

grant execute on function public.get_gallery_reactions(text) to anon, authenticated;

-- Actualizaciones en vivo de reacciones (mismo mecanismo que ya usa el podio
-- para guests/submissions/app_config).
alter publication supabase_realtime add table public.reactions;
