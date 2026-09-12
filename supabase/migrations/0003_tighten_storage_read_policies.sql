-- Pasaporte de Boda — Nati & Leo
-- Ajuste de seguridad post-lint de Supabase: los buckets 'stamps' y 'photos' ya
-- son públicos (public = true en storage.buckets), lo que basta para que
-- cualquiera con la URL exacta de un archivo pueda verlo/descargarlo. Las
-- policies de SELECT que habíamos creado en 0001 además permitían LISTAR todo
-- el contenido del bucket por API (más acceso del necesario). Las quitamos —
-- el acceso a archivos por URL sigue funcionando exactamente igual.
-- Ver: https://supabase.com/docs/guides/storage/security/access-control

drop policy if exists "public_read_stamps" on storage.objects;
drop policy if exists "public_read_photos" on storage.objects;
