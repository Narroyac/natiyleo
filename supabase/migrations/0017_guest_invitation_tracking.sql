-- Seguimiento manual de envío de invitación y recordatorio por invitado,
-- marcado a mano desde el admin (tabla "Enlaces"). No dispara ningún envío,
-- solo lleva el control. Cubierto por la policy "admin_full_access_guests"
-- ya existente (0001_init.sql), no hace falta ninguna policy nueva.
alter table guests
  add column if not exists invitation_sent boolean not null default false,
  add column if not exists reminder_sent boolean not null default false;
