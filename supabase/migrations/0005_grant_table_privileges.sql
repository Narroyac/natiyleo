-- Pasaporte de Boda — Nati & Leo
-- Al desactivar "Automatically expose new tables" en la creación del proyecto
-- (recomendado por seguridad, ver README), Supabase deja de otorgar
-- automáticamente el privilegio base de tabla a los roles de la Data API.
-- Las policies de RLS de 0001 ya estaban bien, pero sin este GRANT no se
-- llega ni a evaluarlas (error "permission denied for table ..."). Se agrega
-- explícitamente, alineado con lo que cada policy ya permite.

grant usage on schema public to anon, authenticated;

grant select on public.challenges to anon, authenticated;
grant select on public.special_badges to anon, authenticated;
grant select on public.submissions to anon, authenticated;

grant select, insert, update, delete on public.app_config to authenticated;
grant select, insert, update, delete on public.special_badges to authenticated;
grant select, insert, update, delete on public.challenges to authenticated;
grant select, insert, update, delete on public.guests to authenticated;
grant select, insert, update, delete on public.submissions to authenticated;
