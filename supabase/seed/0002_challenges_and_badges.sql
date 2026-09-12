-- Pasaporte de Boda — Nati & Leo
-- Datos precargados: los 11 retos de actividad + catálogo inicial de roles especiales.
-- Corre esto UNA VEZ después de 0001_init.sql. Es seguro re-correrlo (usa upsert por título/label).

-- =========================================================
-- Los 11 retos (sección 11 del brief)
-- =========================================================
insert into challenges (title, requires_photo, requires_text, sort_order, icon_url) values
  ('Confirma tu asistencia', false, false, 1, 'stamps/reto-1.svg'),
  ('Elige el menú que prefieres el día de la boda', false, false, 2, 'stamps/reto-2.svg'),
  ('Tómate una foto con alguien que no conocías antes de la boda', true, false, 3, 'stamps/reto-3.svg'),
  ('Pide una bebida y brinda con el/la capitán de mesa', true, false, 4, 'stamps/reto-4.svg'),
  ('Encuentra tu lugar o detalle favorito de la decoración y tómale una foto', true, false, 5, 'stamps/reto-5.svg'),
  ('Baila una canción completa sin salir de la pista', true, false, 6, 'stamps/reto-6.svg'),
  ('Brinda con uno de los novios', true, false, 7, 'stamps/reto-7.svg'),
  ('Invita a bailar a alguien con quien todavía no hayas bailado', true, false, 8, 'stamps/reto-8.svg'),
  ('Canta junto con otra persona su parte favorita de la canción', true, false, 9, 'stamps/reto-9.svg'),
  ('Escribe un deseo para la nueva etapa de los novios', false, true, 10, 'stamps/reto-10.svg'),
  ('Captura un momento espontáneo de la boda sin pedirle a las personas que posen', true, false, 11, 'stamps/reto-11.svg')
on conflict (title) do nothing;

-- =========================================================
-- Catálogo inicial de roles especiales (sección 11 del brief).
-- Nati puede renombrar/eliminar/crear nuevos desde el admin en cualquier momento —
-- esto es solo el punto de partida. La asignación a invitados específicos
-- (Diana, Freddy, Dani C, Mafe, Julián y Juliana) se hace desde el admin, no aquí.
-- =========================================================
insert into special_badges (label, icon_url, is_active, sort_order) values
  ('Madrina', 'stamps/role-madrina.svg', true, 1),
  ('Padrino', 'stamps/role-padrino.svg', true, 2),
  ('Dama de honor', 'stamps/role-dama-de-honor.svg', true, 3),
  ('Caballero de honor', 'stamps/role-caballero-de-honor.svg', true, 4),
  ('Papás de los pajecitos', 'stamps/role-papas-pajecitos.svg', true, 5),
  ('Capitán/Capitana de mesa', 'stamps/role-capitan-mesa.svg', true, 6)
on conflict (label) do nothing;
