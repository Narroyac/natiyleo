// Pasaporte de Boda — Nati & Leo
// Cliente de Supabase compartido por todas las páginas.
// La anon key es segura de exponer en el navegador por diseño de Supabase —
// el acceso real está controlado por Row Level Security y las funciones RPC
// del esquema (ver supabase/migrations/0001_init.sql).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://jwlyzuprgohofqvpfwdj.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bHl6dXByZ29ob2ZxdnBmd2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MzU3NDQsImV4cCI6MjA5OTMxMTc0NH0.tkQj6bQ0EhjPQNEG87dZnH4k0yHgcauW7Nu8SGlbuc0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Convierte una ruta relativa de Storage (ej. "stamps/reto-1.svg") en su URL pública. */
export function storageUrl(bucketAndPath) {
  if (!bucketAndPath) return null;
  const [bucket, ...rest] = bucketAndPath.split("/");
  const path = rest.join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export const GUEST_CODE_KEY = "pasaporte_guest_code";

export function getSavedCode() {
  try {
    return localStorage.getItem(GUEST_CODE_KEY);
  } catch {
    return null;
  }
}

export function saveCode(code) {
  try {
    localStorage.setItem(GUEST_CODE_KEY, code);
  } catch {
    /* localStorage no disponible, seguimos sin recordar el código */
  }
}
